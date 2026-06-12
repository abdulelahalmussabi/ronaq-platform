/**
 * تصدير المواعيد إلى Google Calendar وملفات ICS (iCalendar)
 * يعمل بالكامل في المتصفح — لا يحتاج OAuth أو خادم.
 */
(function () {
  'use strict';

  var DEFAULT_DURATION = 30;
  var TIMEZONE = 'Asia/Riyadh';

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function parseLocalStart(dateStr, timeStr) {
    var parts = (timeStr || '00:00').split(':');
    var h = parseInt(parts[0], 10) || 0;
    var m = parseInt(parts[1], 10) || 0;
    var d = new Date(dateStr + 'T12:00:00');
    d.setHours(h, m, 0, 0);
    return d;
  }

  function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60000);
  }

  function formatGoogleDate(date) {
    return (
      date.getFullYear() +
      pad(date.getMonth() + 1) +
      pad(date.getDate()) +
      'T' +
      pad(date.getHours()) +
      pad(date.getMinutes()) +
      pad(date.getSeconds())
    );
  }

  function formatIcsUtc(date) {
    return (
      date.getUTCFullYear() +
      pad(date.getUTCMonth() + 1) +
      pad(date.getUTCDate()) +
      'T' +
      pad(date.getUTCHours()) +
      pad(date.getUTCMinutes()) +
      pad(date.getUTCSeconds()) +
      'Z'
    );
  }

  function formatIcsLocal(date) {
    return (
      date.getFullYear() +
      pad(date.getMonth() + 1) +
      pad(date.getDate()) +
      'T' +
      pad(date.getHours()) +
      pad(date.getMinutes()) +
      pad(date.getSeconds())
    );
  }

  function escapeIcs(value) {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  function foldIcsLine(line) {
    var max = 75;
    if (line.length <= max) return line;
    var out = line.slice(0, max);
    var rest = line.slice(max);
    while (rest.length) {
      out += '\r\n ' + rest.slice(0, max - 1);
      rest = rest.slice(max - 1);
    }
    return out;
  }

  function getDurationMinutes(appointment, meta) {
    var d = parseInt(meta && meta.durationMinutes, 10);
    return d >= 15 && d <= 480 ? d : DEFAULT_DURATION;
  }

  function getEventTimes(appointment, meta) {
    var duration = getDurationMinutes(appointment, meta);
    var start = parseLocalStart(appointment.date, appointment.time);
    var end;
    var nights = parseInt(appointment.nights, 10);
    if (nights > 0 && nights <= 90) {
      end = new Date(start);
      end.setDate(end.getDate() + nights);
    } else {
      end = addMinutes(start, duration);
    }
    return { start: start, end: end, duration: duration };
  }

  function buildLocation(appointment, meta) {
    if (appointment.locationAddress) return appointment.locationAddress;
    if (meta && meta.location) return meta.location;
    if (appointment.district) return appointment.district;
    return '';
  }

  function buildTitle(appointment, meta) {
    var brand = (meta && meta.brandName) || 'مكِّن';
    var service = (meta && meta.serviceTitle) || appointment.serviceId || 'موعد';
    return brand + ' — ' + service;
  }

  function buildDescription(appointment, meta) {
    var lines = [];
    if (meta && meta.activityTitle) lines.push('النشاط: ' + meta.activityTitle);
    if (meta && meta.serviceTitle) lines.push('الخدمة: ' + meta.serviceTitle);
    if (appointment.customerName) lines.push('العميل: ' + appointment.customerName);
    if (appointment.phone) lines.push('الجوال: ' + appointment.phone);
    if (appointment.district) lines.push('الحي: ' + appointment.district);
    if (appointment.partySize) lines.push('عدد الأشخاص: ' + appointment.partySize);
    if (appointment.nights) lines.push('عدد الليالي: ' + appointment.nights);
    if (appointment.notes) lines.push('ملاحظات: ' + appointment.notes);
    lines.push('— منصة مكِّن');
    return lines.join('\n');
  }

  function buildGoogleCalendarUrl(appointment, meta) {
    var times = getEventTimes(appointment, meta);
    var params = new URLSearchParams({
      action: 'TEMPLATE',
      text: buildTitle(appointment, meta),
      dates: formatGoogleDate(times.start) + '/' + formatGoogleDate(times.end),
      details: buildDescription(appointment, meta),
      ctz: TIMEZONE,
    });
    var location = buildLocation(appointment, meta);
    if (location) params.set('location', location);
    return 'https://calendar.google.com/calendar/render?' + params.toString();
  }

  function buildIcsEvent(appointment, meta) {
    var times = getEventTimes(appointment, meta);
    var uid = (appointment.id || 'evt_' + appointment.date + appointment.time) + '@mken.platform';
    var now = new Date();
    var lines = [
      'BEGIN:VEVENT',
      'UID:' + uid,
      'DTSTAMP:' + formatIcsUtc(now),
      'DTSTART;TZID=' + TIMEZONE + ':' + formatIcsLocal(times.start),
      'DTEND;TZID=' + TIMEZONE + ':' + formatIcsLocal(times.end),
      foldIcsLine('SUMMARY:' + escapeIcs(buildTitle(appointment, meta))),
      foldIcsLine('DESCRIPTION:' + escapeIcs(buildDescription(appointment, meta))),
    ];
    var location = buildLocation(appointment, meta);
    if (location) lines.push(foldIcsLine('LOCATION:' + escapeIcs(location)));
    if (appointment.status === 'cancelled') {
      lines.push('STATUS:CANCELLED');
    } else {
      lines.push('STATUS:CONFIRMED');
    }
    lines.push('END:VEVENT');
    return lines.join('\r\n');
  }

  function buildIcsCalendar(appointments, getMeta) {
    var events = (appointments || []).map(function (apt) {
      var meta = typeof getMeta === 'function' ? getMeta(apt) : getMeta;
      return buildIcsEvent(apt, meta);
    }).filter(Boolean);

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Mken Platform//AR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:مواعيد مكِّن',
      'X-WR-TIMEZONE:' + TIMEZONE,
      'BEGIN:VTIMEZONE',
      'TZID:' + TIMEZONE,
      'X-LIC-LOCATION:' + TIMEZONE,
      'BEGIN:STANDARD',
      'TZOFFSETFROM:+0300',
      'TZOFFSETTO:+0300',
      'TZNAME:+03',
      'DTSTART:19700101T000000',
      'END:STANDARD',
      'END:VTIMEZONE',
    ].concat(events).concat(['END:VCALENDAR']).join('\r\n');
  }

  function downloadBlob(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function downloadIcs(appointment, meta, filename) {
    var ics = buildIcsCalendar([appointment], meta);
    var name = filename || ('mken-' + (appointment.date || 'appointment') + '.ics');
    downloadBlob(name, ics, 'text/calendar;charset=utf-8');
  }

  function downloadIcsBatch(appointments, getMeta, filename) {
    var list = (appointments || []).filter(function (a) {
      return a.status !== 'cancelled';
    });
    if (!list.length) return false;
    var ics = buildIcsCalendar(list, getMeta);
    var name = filename || ('mken-appointments-' + formatGoogleDate(new Date()).slice(0, 8) + '.ics');
    downloadBlob(name, ics, 'text/calendar;charset=utf-8');
    return true;
  }

  window.RonaqCalendarExport = {
    TIMEZONE: TIMEZONE,
    getEventTimes: getEventTimes,
    buildGoogleCalendarUrl: buildGoogleCalendarUrl,
    buildIcsEvent: buildIcsEvent,
    buildIcsCalendar: buildIcsCalendar,
    downloadIcs: downloadIcs,
    downloadIcsBatch: downloadIcsBatch,
  };
})();
