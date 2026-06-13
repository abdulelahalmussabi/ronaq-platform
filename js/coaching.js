/**
 * بوابة الأنشطة الرياضية والتمارين — الهوية البصرية للاتحاد السعودي للهوكي
 * إدارة المدربين، اللاعبين، التصويت على المواعيد وخرائط جوجل
 */
(function () {
  'use strict';

  var store = window.MkenServicesStore;
  var db = window.MkenSupabaseDb;

  // معرفات العناصر في واجهة المستخدم
  var viewTrainee = document.getElementById('viewTrainee');
  var viewCoach = document.getElementById('viewCoach');
  var btnViewTrainee = document.getElementById('btnViewTrainee');
  var btnViewCoach = document.getElementById('btnViewCoach');

  // الكوتش الأساسي
  var coachAvatar = document.getElementById('coachAvatar');
  var coachNameDisp = document.getElementById('coachNameDisp');
  var coachBioDisp = document.getElementById('coachBioDisp');
  var coachPhoneDisp = document.getElementById('coachPhoneDisp');

  // قائمة اللاعبين
  var playersListBody = document.getElementById('playersListBody');
  var addPlayerForm = document.getElementById('addPlayerForm');

  // التصويت
  var pollContainer = document.getElementById('pollContainer');
  var activePollForm = document.getElementById('activePollForm');
  var pollResults = document.getElementById('pollResults');

  // التمارين المعتمدة
  var workoutsList = document.getElementById('workoutsList');

  // لوحة تحكم الكوتش
  var coachInfoForm = document.getElementById('coachInfoForm');
  var createPollForm = document.getElementById('createPollForm');
  var managePollContainer = document.getElementById('managePollContainer');

  // نافذة الرمز السري (PIN Modal)
  var pinModal = document.getElementById('pinModal');
  var pinDotsContainer = document.getElementById('pinDotsContainer');
  var pinKeyboard = document.getElementById('pinKeyboard');

  // البيانات المؤقتة والافتراضية للاتحاد السعودي للهوكي
  var defaultCoachingData = {
    coachName: 'الكوتش ياسر السليماني',
    coachBio: 'كوتش هوكي معتمد من الاتحاد السعودي للهوكي، مدرب المنتخب الوطني للفئات السنية وخبير تكتيكي.',
    coachPhone: '9665056138908',
    players: [
      { id: 'pl-1', name: 'أحمد المالكي', phone: '0501111111', status: 'active' },
      { id: 'pl-2', name: 'سلمان الدوسري', phone: '0502222222', status: 'active' },
      { id: 'pl-3', name: 'مهند الحربي', phone: '0503333333', status: 'active' },
      { id: 'pl-4', name: 'فيصل الشمري', phone: '0504444444', status: 'trial' }
    ],
    activePoll: {
      question: 'التصويت على التمرين القادم للهوكي 🏑',
      status: 'active', // active, closed
      timings: [
        { id: 'time-1', label: 'الأحد - الساعة 06:00 مساءً', votes: 2 },
        { id: 'time-2', label: 'الأربعاء - الساعة 08:00 مساءً', votes: 1 }
      ],
      locations: [
        { id: 'loc-1', name: 'ملعب مجمع الأمير فيصل بن فهد الأولمبي (الرياض)', mapUrl: 'https://maps.google.com/?q=24.6758,46.7371', votes: 2 },
        { id: 'loc-2', name: 'ملاعب معهد إعداد القادة بالرياض', mapUrl: 'https://maps.google.com/?q=24.7214,46.6345', votes: 1 }
      ],
      votedPhones: ['0501111111', '0502222222']
    },
    finalizedWorkouts: [
      {
        id: 'work-1',
        dateTime: 'الخميس الماضي - الساعة 07:00 مساءً',
        locationName: 'ملاعب معهد إعداد القادة بالرياض',
        mapUrl: 'https://maps.google.com/?q=24.7214,46.6345',
        coachName: 'الكوتش ياسر السليماني',
        playersCount: 4
      }
    ]
  };

  var coachingData = null;
  var currentTenantSlug = 'default';
  var configObj = {};
  var enteredPin = '';
  var isCoachAuthenticated = false;

  // توست التنبيهات
  function showToast(msg, isError) {
    var toast = document.getElementById('hockeyToast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.borderRightColor = isError ? '#e74c3c' : 'var(--hockey-primary)';
    toast.classList.add('hockey-toast--show');
    setTimeout(function () {
      toast.classList.remove('hockey-toast--show');
    }, 3000);
  }

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  // تحميل البيانات
  function loadData() {
    currentTenantSlug = (store && typeof store.getCurrentTenantSlug === 'function' ? store.getCurrentTenantSlug() : 'default') || 'default';
    
    // محاولة التحميل من Supabase إن وجد
    if (db && typeof db.isConfigured === 'function' && db.isConfigured()) {
      return db.fetchConfig(currentTenantSlug)
        .then(function (cfg) {
          configObj = cfg || {};
          if (configObj.coaching) {
            coachingData = configObj.coaching;
          } else {
            coachingData = Object.assign({}, defaultCoachingData);
          }
          applyLoadedData();
        })
        .catch(function (err) {
          console.warn('Failed to fetch from Supabase, loading local', err);
          loadLocalData();
        });
    } else {
      loadLocalData();
      return Promise.resolve();
    }
  }

  function loadLocalData() {
    try {
      var raw = localStorage.getItem('mken_hockey_coaching_' + currentTenantSlug);
      if (raw) {
        coachingData = JSON.parse(raw);
      } else {
        coachingData = Object.assign({}, defaultCoachingData);
      }
    } catch (e) {
      coachingData = Object.assign({}, defaultCoachingData);
    }
    applyLoadedData();
  }

  // حفظ البيانات
  function saveData() {
    if (!coachingData) return Promise.resolve();
    
    // محلياً أولاً
    localStorage.setItem('mken_hockey_coaching_' + currentTenantSlug, JSON.stringify(coachingData));

    // سحابياً عبر Supabase إن وجد
    if (db && typeof db.isConfigured === 'function' && db.isConfigured()) {
      configObj.coaching = coachingData;
      return db.saveConfig(configObj, currentTenantSlug)
        .then(function () {
          console.log('Synced coaching data with Supabase');
        })
        .catch(function (err) {
          console.error('Failed to sync coaching data with Supabase', err);
        });
    }
    return Promise.resolve();
  }

  function applyLoadedData() {
    renderCoachInfo();
    renderPlayersList();
    renderPoll();
    renderFinalizedWorkouts();
    fillCoachForms();
  }

  // --- الرندرة ---

  // 1. بيانات الكوتش
  function renderCoachInfo() {
    if (coachNameDisp) coachNameDisp.textContent = coachingData.coachName;
    if (coachBioDisp) coachBioDisp.textContent = coachingData.coachBio;
    if (coachPhoneDisp) {
      coachPhoneDisp.textContent = '📞 ' + coachingData.coachPhone;
      var waPhone = coachingData.coachPhone.replace(/\+/g, '');
      coachPhoneDisp.href = 'https://wa.me/' + waPhone;
    }
  }

  // 2. قائمة اللاعبين
  function renderPlayersList() {
    if (!playersListBody) return;
    
    if (!coachingData.players || !coachingData.players.length) {
      playersListBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">لا يوجد لاعبون مسجلون حالياً.</td></tr>';
      return;
    }

    playersListBody.innerHTML = coachingData.players.map(function (player, idx) {
      var statusBadge = '';
      if (player.status === 'active') statusBadge = '<span class="badge-status badge-status--active">مشترك نشط</span>';
      else if (player.status === 'trial') statusBadge = '<span class="badge-status badge-status--trial">فترة تجريبية</span>';
      else statusBadge = '<span class="badge-status badge-status--expired">منتهي</span>';

      var deleteBtn = isCoachAuthenticated 
        ? '<td><button class="delete-player-btn" data-id="' + player.id + '">🗑️</button></td>'
        : '';

      return (
        '<tr>' +
        '  <td>' + (idx + 1) + '</td>' +
        '  <td style="font-weight:bold;">' + esc(player.name) + '</td>' +
        '  <td>' + statusBadge + '</td>' +
        deleteBtn +
        '</tr>'
      );
    }).join('');

    // تفعيل أزرار الحذف للمدرب
    if (isCoachAuthenticated) {
      playersListBody.querySelectorAll('.delete-player-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.getAttribute('data-id');
          var player = coachingData.players.find(function (p) { return p.id === id; });
          if (player && confirm('هل أنت متأكد من حذف اللاعب "' + player.name + '"؟')) {
            coachingData.players = coachingData.players.filter(function (p) { return p.id !== id; });
            saveData().then(function () {
              renderPlayersList();
              showToast('تم حذف اللاعب بنجاح');
            });
          }
        });
      });
    }
  }

  // 3. قسم التصويت
  function renderPoll() {
    var poll = coachingData.activePoll;
    if (!pollContainer) return;

    if (!poll || poll.status === 'closed') {
      pollContainer.innerHTML = '<div style="text-align:center; padding:20px; color:var(--hockey-silver);">لا يوجد تصويت نشط حالياً. سيقوم الكوتش بإنشاء تصويت جديد قريباً. 🏑</div>';
      return;
    }

    // رندرة خيارات التصويت للنموذج
    if (activePollForm) {
      var questionTitle = document.getElementById('pollQuestionTitle');
      if (questionTitle) questionTitle.textContent = poll.question;

      // خيارات التوقيت
      var timingsContainer = document.getElementById('timingsVoteOptions');
      if (timingsContainer) {
        timingsContainer.innerHTML = poll.timings.map(function (time) {
          return (
            '<div class="vote-option-card" data-type="time" data-id="' + time.id + '">' +
            '  <div class="vote-option-card__details">' +
            '    <span class="vote-option-card__title">' + esc(time.label) + '</span>' +
            '  </div>' +
            '  <div class="vote-option-card__radio"></div>' +
            '</div>'
          );
        }).join('');
      }

      // خيارات المواقع
      var locationsContainer = document.getElementById('locationsVoteOptions');
      if (locationsContainer) {
        locationsContainer.innerHTML = poll.locations.map(function (loc) {
          return (
            '<div class="vote-option-card" data-type="location" data-id="' + loc.id + '">' +
            '  <div class="vote-option-card__details">' +
            '    <span class="vote-option-card__title">' + esc(loc.name) + '</span>' +
            '    <a href="' + esc(loc.mapUrl) + '" target="_blank" class="vote-option-card__map-link" onclick="event.stopPropagation();">🗺️ عرض على خريطة جوجل</a>' +
            '  </div>' +
            '  <div class="vote-option-card__radio"></div>' +
            '</div>'
          );
        }).join('');
      }

      // تفعيل كروت الخيارات بالتصويت
      setupOptionCardsClick();
    }

    // رندرة نتائج التصويت
    renderPollResultsHTML();
  }

  function setupOptionCardsClick() {
    var cards = document.querySelectorAll('.vote-option-card');
    cards.forEach(function (card) {
      card.addEventListener('click', function () {
        var type = card.getAttribute('data-type');
        // إلغاء تحديد الكروت الأخرى من نفس النوع
        document.querySelectorAll('.vote-option-card[data-type="' + type + '"]').forEach(function (c) {
          c.classList.remove('vote-option-card--selected');
        });
        card.classList.add('vote-option-card--selected');
      });
    });
  }

  function renderPollResultsHTML() {
    if (!pollResults) return;
    var poll = coachingData.activePoll;
    if (!poll || poll.status === 'closed') {
      pollResults.innerHTML = '';
      return;
    }

    // حساب إجمالي الأصوات للتوقيت والموقع
    var totalTimeVotes = poll.timings.reduce(function (acc, curr) { return acc + curr.votes; }, 0);
    var totalLocVotes = poll.locations.reduce(function (acc, curr) { return acc + curr.votes; }, 0);

    var html = '<h4 style="margin-bottom:15px; border-bottom:1px solid rgba(187,187,187,0.2); padding-bottom:8px;">📊 نتائج التصويت الحالية</h4>';

    html += '<p style="font-weight:700; font-size:0.9rem; margin-bottom:10px;">نتائج التوقيت المفضّل (' + totalTimeVotes + ' صوت):</p>';
    html += poll.timings.map(function (time) {
      var pct = totalTimeVotes > 0 ? Math.round((time.votes / totalTimeVotes) * 100) : 0;
      return (
        '<div class="vote-result-bar-container" style="margin-bottom:15px;">' +
        '  <div class="vote-result-meta">' +
        '    <span>' + esc(time.label) + '</span>' +
        '    <span>' + time.votes + ' صوت (' + pct + '%)</span>' +
        '  </div>' +
        '  <div class="vote-result-bar-outer">' +
        '    <div class="vote-result-bar-inner" style="width: ' + pct + '%;"></div>' +
        '  </div>' +
        '</div>'
      );
    }).join('');

    html += '<p style="font-weight:700; font-size:0.9rem; margin:20px 0 10px 0;">نتائج الموقع الجغرافي المفضّل (' + totalLocVotes + ' صوت):</p>';
    html += poll.locations.map(function (loc) {
      var pct = totalLocVotes > 0 ? Math.round((loc.votes / totalLocVotes) * 100) : 0;
      return (
        '<div class="vote-result-bar-container" style="margin-bottom:15px;">' +
        '  <div class="vote-result-meta">' +
        '    <span>' + esc(loc.name) + '</span>' +
        '    <span>' + loc.votes + ' صوت (' + pct + '%)</span>' +
        '  </div>' +
        '  <div class="vote-result-bar-outer">' +
        '    <div class="vote-result-bar-inner" style="width: ' + pct + '%;"></div>' +
        '  </div>' +
        '</div>'
      );
    }).join('');

    pollResults.innerHTML = html;
  }

  // 4. التمارين المعتمدة
  function renderFinalizedWorkouts() {
    if (!workoutsList) return;

    if (!coachingData.finalizedWorkouts || !coachingData.finalizedWorkouts.length) {
      workoutsList.innerHTML = '<p style="text-align:center; color:var(--hockey-silver); padding:15px;">لا توجد تمارين معتمدة مسبقاً.</p>';
      return;
    }

    workoutsList.innerHTML = coachingData.finalizedWorkouts.map(function (w) {
      return (
        '<div class="finalized-workout">' +
        '  <div class="finalized-workout__content">' +
        '    <div class="finalized-workout__title">' + esc(w.dateTime) + '</div>' +
        '    <div class="finalized-workout__meta">' +
        '      <span>👥 اللاعبين المقيدين: ' + (w.playersCount || coachingData.players.length) + ' لاعبين</span>' +
        '      <span>🧢 المدرب: ' + esc(w.coachName || coachingData.coachName) + '</span>' +
        '    </div>' +
        '  </div>' +
        '  <a href="' + esc(w.mapUrl) + '" target="_blank" class="hockey-btn hockey-btn--dark hockey-btn--sm">' +
        '    🏑 موقع التمرين (خرائط جوجل)' +
        '  </a>' +
        '</div>'
      );
    }).join('');
  }

  // تعبئة نماذج التعديل للكوتش بالبيانات الحالية
  function fillCoachForms() {
    if (coachInfoForm) {
      document.getElementById('editCoachName').value = coachingData.coachName;
      document.getElementById('editCoachBio').value = coachingData.coachBio;
      document.getElementById('editCoachPhone').value = coachingData.coachPhone;
    }

    if (managePollContainer) {
      var poll = coachingData.activePoll;
      if (poll && poll.status === 'active') {
        // تحديث واجهة الاعتماد السريع للكوتش
        var finalizeTimingSelect = document.getElementById('finalizeTimingSelect');
        var finalizeLocationSelect = document.getElementById('finalizeLocationSelect');

        if (finalizeTimingSelect) {
          finalizeTimingSelect.innerHTML = poll.timings.map(function (t) {
            return '<option value="' + t.id + '">' + esc(t.label) + ' (' + t.votes + ' صوت)</option>';
          }).join('');
        }

        if (finalizeLocationSelect) {
          finalizeLocationSelect.innerHTML = poll.locations.map(function (l) {
            return '<option value="' + l.id + '">' + esc(l.name) + ' (' + l.votes + ' صوت)</option>';
          }).join('');
        }

        managePollContainer.style.display = 'block';
      } else {
        managePollContainer.style.display = 'none';
      }
    }
  }

  // --- معالجة الأحداث (Events) ---

  // التبديل بين الواجهات
  if (btnViewTrainee) {
    btnViewTrainee.addEventListener('click', function () {
      btnViewTrainee.classList.add('hockey-switch-btn--active');
      btnViewCoach.classList.remove('hockey-switch-btn--active');
      viewTrainee.hidden = false;
      viewCoach.hidden = true;
    });
  }

  if (btnViewCoach) {
    btnViewCoach.addEventListener('click', function () {
      if (isCoachAuthenticated) {
        showCoachView();
      } else {
        openPinModal();
      }
    });
  }

  function showCoachView() {
    btnViewCoach.classList.add('hockey-switch-btn--active');
    btnViewTrainee.classList.remove('hockey-switch-btn--active');
    viewTrainee.hidden = true;
    viewCoach.hidden = false;
    renderPlayersList();
  }

  // إرسال التصويت من قبل اللاعبين
  if (activePollForm) {
    activePollForm.addEventListener('submit', function (e) {
      e.preventDefault();

      var selectedTimeCard = document.querySelector('.vote-option-card[data-type="time"].vote-option-card--selected');
      var selectedLocCard = document.querySelector('.vote-option-card[data-type="location"].vote-option-card--selected');
      var voterName = document.getElementById('voterName').value.trim();
      var voterPhone = document.getElementById('voterPhone').value.trim();

      if (!selectedTimeCard || !selectedLocCard) {
        showToast('يرجى اختيار موعد وموقع للتصويت!', true);
        return;
      }

      if (!voterName || !voterPhone) {
        showToast('يرجى إدخال اسمك ورقم جوالك للمتابعة!', true);
        return;
      }

      // التحقق من رقم الجوال
      var formattedPhone = voterPhone.replace(/\s+/g, '');
      var poll = coachingData.activePoll;

      // منع التكرار
      if (poll.votedPhones && poll.votedPhones.indexOf(formattedPhone) !== -1) {
        showToast('لقد قمت بالتصويت مسبقاً بهذا الرقم!', true);
        return;
      }

      // زيادة الأصوات في الهيكل
      var timeId = selectedTimeCard.getAttribute('data-id');
      var locId = selectedLocCard.getAttribute('data-id');

      var timeOpt = poll.timings.find(function (t) { return t.id === timeId; });
      var locOpt = poll.locations.find(function (l) { return l.id === locId; });

      if (timeOpt) timeOpt.votes += 1;
      if (locOpt) locOpt.votes += 1;

      if (!poll.votedPhones) poll.votedPhones = [];
      poll.votedPhones.push(formattedPhone);

      // إضافة اللاعب تلقائياً للقائمة إن لم يكن موجوداً
      var isPlayerExist = coachingData.players.some(function (p) { return p.phone === formattedPhone; });
      if (!isPlayerExist) {
        coachingData.players.push({
          id: 'pl-' + Date.now(),
          name: voterName,
          phone: formattedPhone,
          status: 'active'
        });
      }

      saveData().then(function () {
        applyLoadedData();
        showToast('تم تسجيل تصويتك بنجاح! 🏑');
        activePollForm.reset();
        
        // إزالة التحديد عن الكروت
        document.querySelectorAll('.vote-option-card').forEach(function (c) {
          c.classList.remove('vote-option-card--selected');
        });
      });
    });
  }

  // حفظ تعديلات معلومات الكوتش
  if (coachInfoForm) {
    coachInfoForm.addEventListener('submit', function (e) {
      e.preventDefault();
      coachingData.coachName = document.getElementById('editCoachName').value.trim();
      coachingData.coachBio = document.getElementById('editCoachBio').value.trim();
      coachingData.coachPhone = document.getElementById('editCoachPhone').value.trim();

      saveData().then(function () {
        applyLoadedData();
        showToast('تم تحديث معلومات الكوتش بنجاح');
      });
    });
  }

  // إضافة لاعب جديد بواسطة الكوتش
  if (addPlayerForm) {
    addPlayerForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = document.getElementById('newPlayerName').value.trim();
      var phone = document.getElementById('newPlayerPhone').value.trim();
      var status = document.getElementById('newPlayerStatus').value;

      if (!name || !phone) return;

      var newPlayer = {
        id: 'pl-' + Date.now(),
        name: name,
        phone: phone.replace(/\s+/g, ''),
        status: status
      };

      coachingData.players.push(newPlayer);
      saveData().then(function () {
        renderPlayersList();
        addPlayerForm.reset();
        showToast('تم إضافة اللاعب الجديد بنجاح');
      });
    });
  }

  // إنشاء تصويت جديد بواسطة الكوتش
  if (createPollForm) {
    createPollForm.addEventListener('submit', function (e) {
      e.preventDefault();
      
      var t1 = document.getElementById('pollTime1').value.trim();
      var t2 = document.getElementById('pollTime2').value.trim();
      var l1Name = document.getElementById('pollLoc1Name').value.trim();
      var l1Url = document.getElementById('pollLoc1Url').value.trim();
      var l2Name = document.getElementById('pollLoc2Name').value.trim();
      var l2Url = document.getElementById('pollLoc2Url').value.trim();

      if (!t1 || !t2 || !l1Name || !l1Url || !l2Name || !l2Url) {
        showToast('يرجى تعبئة كافة خيارات التصويت!', true);
        return;
      }

      coachingData.activePoll = {
        question: 'التصويت على التمرين القادم للهوكي 🏑',
        status: 'active',
        timings: [
          { id: 'time-1', label: t1, votes: 0 },
          { id: 'time-2', label: t2, votes: 0 }
        ],
        locations: [
          { id: 'loc-1', name: l1Name, mapUrl: l1Url, votes: 0 },
          { id: 'loc-2', name: l2Name, mapUrl: l2Url, votes: 0 }
        ],
        votedPhones: []
      };

      saveData().then(function () {
        applyLoadedData();
        createPollForm.reset();
        showToast('تم إطلاق التصويت الجديد للمتدربين');
      });
    });
  }

  // اعتماد التمرين وإغلاق التصويت بواسطة الكوتش
  var btnFinalizeWorkout = document.getElementById('btnFinalizeWorkout');
  if (btnFinalizeWorkout) {
    btnFinalizeWorkout.addEventListener('click', function () {
      var poll = coachingData.activePoll;
      if (!poll || poll.status === 'closed') return;

      var finalizeTimingSelect = document.getElementById('finalizeTimingSelect');
      var finalizeLocationSelect = document.getElementById('finalizeLocationSelect');

      var timeId = finalizeTimingSelect.value;
      var locId = finalizeLocationSelect.value;

      var timeOpt = poll.timings.find(function (t) { return t.id === timeId; });
      var locOpt = poll.locations.find(function (l) { return l.id === locId; });

      if (!timeOpt || !locOpt) return;

      var newWorkout = {
        id: 'work-' + Date.now(),
        dateTime: timeOpt.label,
        locationName: locOpt.name,
        mapUrl: locOpt.mapUrl,
        coachName: coachingData.coachName,
        playersCount: coachingData.players.length
      };

      if (!coachingData.finalizedWorkouts) {
        coachingData.finalizedWorkouts = [];
      }
      coachingData.finalizedWorkouts.unshift(newWorkout);

      // إغلاق التصويت
      coachingData.activePoll = {
        question: '',
        status: 'closed',
        timings: [],
        locations: [],
        votedPhones: []
      };

      saveData().then(function () {
        applyLoadedData();
        showToast('تم اعتماد التمرين ونشر الموعد النهائي للمتدربين! 🏆');
      });
    });
  }

  // --- معالجة الـ PIN والتحقق للكوتش ---
  function openPinModal() {
    enteredPin = '';
    updatePinDots();
    if (pinModal) pinModal.classList.add('pin-modal--open');
  }

  function closePinModal() {
    if (pinModal) pinModal.classList.remove('pin-modal--open');
  }

  function updatePinDots() {
    var dots = pinDotsContainer.querySelectorAll('.pin-dot');
    dots.forEach(function (dot, idx) {
      if (idx < enteredPin.length) {
        dot.classList.add('pin-dot--active');
      } else {
        dot.classList.remove('pin-dot--active');
      }
    });
  }

  // بناء كيبورد الـ PIN البرمجية وتفعيل الأزرار
  if (pinKeyboard) {
    pinKeyboard.innerHTML = '';
    // الأرقام من 1 إلى 9
    for (var i = 1; i <= 9; i++) {
      pinKeyboard.innerHTML += '<button type="button" class="pin-key" data-val="' + i + '">' + i + '</button>';
    }
    // مسح، صفر، إلغاء
    pinKeyboard.innerHTML += '<button type="button" class="pin-key" data-val="clear" style="font-size: 0.9rem; color: #e74c3c;">مسح</button>';
    pinKeyboard.innerHTML += '<button type="button" class="pin-key" data-val="0">0</button>';
    pinKeyboard.innerHTML += '<button type="button" class="pin-key" data-val="close" style="font-size: 0.9rem;">إلغاء</button>';

    // أحداث الكيبورد
    pinKeyboard.querySelectorAll('.pin-key').forEach(function (key) {
      key.addEventListener('click', function () {
        var val = key.getAttribute('data-val');
        if (val === 'clear') {
          enteredPin = '';
          updatePinDots();
        } else if (val === 'close') {
          closePinModal();
        } else {
          if (enteredPin.length < 4) {
            enteredPin += val;
            updatePinDots();

            if (enteredPin.length === 4) {
              // التحقق من الرمز PIN (الافتراضي هو 1234 أو PIN الكوتش)
              setTimeout(function () {
                if (enteredPin === '1234') {
                  isCoachAuthenticated = true;
                  closePinModal();
                  showCoachView();
                  showToast('تم تسجيل دخول المدرب بنجاح! 🏑');
                } else {
                  enteredPin = '';
                  updatePinDots();
                  showToast('الرمز السري غير صحيح! يرجى المحاولة مرة أخرى.', true);
                }
              }, 200);
            }
          }
        }
      });
    });
  }

  // تشغيل التهيئة عند تحميل المستند
  document.addEventListener('DOMContentLoaded', function () {
    loadData().then(function () {
      console.log('Hockey coaching portal successfully initialized');
    });
  });

})();
