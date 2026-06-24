/**
 * سجل قوالب الواجهة — يربط uiProfile بكل نشاط
 */
window.MkenUiProfiles = {
  'field-service': {
    id: 'field-service',
    sections: ['hero', 'stats', 'features', 'services', 'brands', 'about', 'process', 'faq', 'contact'],
    showServiceArea: true,
    showBooking: true,
    bookingType: 'field-visit',
  },
  'project-based': {
    id: 'project-based',
    sections: ['hero', 'stats', 'features', 'services', 'portfolio', 'about', 'process', 'faq', 'contact'],
    showServiceArea: false,
    showBooking: true,
    bookingType: 'consultation',
  },
  'appointment-based': {
    id: 'appointment-based',
    sections: ['hero', 'stats', 'features', 'services', 'about', 'process', 'faq', 'contact'],
    showServiceArea: false,
    showBooking: true,
    bookingType: 'appointment',
  },
  'order-based': {
    id: 'order-based',
    sections: ['hero', 'stats', 'features', 'services', 'about', 'process', 'faq', 'contact'],
    showServiceArea: false,
    showBooking: false,
    showOrder: true,
    bookingType: 'order',
  },
};

window.MkenContentRegistry = {
  maintenance: function () { return window.MkenContentMaintenance; },
  'tech-digital': function () { return window.MkenContentTechDigital; },
  'it-support': function () { return window.MkenContentItSupport; },
  cleaning: function () { return window.MkenContentCleaning; },
  renovation: function () { return window.MkenContentRenovation; },
  security: function () { return window.MkenContentSecurity; },
  training: function () { return window.MkenContentTraining; },
  'barber-salon': function () { return window.MkenContentBarberSalon; },
  'car-care': function () { return window.MkenContentCarCare; },
  healthcare: function () { return window.MkenContentHealthcare; },
  'spa-wellness': function () { return window.MkenContentSpaWellness; },
  fitness: function () { return window.MkenContentFitness; },
  veterinary: function () { return window.MkenContentVeterinary; },
  restaurant: function () { return window.MkenContentRestaurant; },
  consulting: function () { return window.MkenContentConsulting; },
  photography: function () { return window.MkenContentPhotography; },
  tutoring: function () { return window.MkenContentTutoring; },
  bodybuilding: function () { return window.MkenContentBodybuilding; },
  football: function () { return window.MkenContentFootball; },
  hotels: function () { return window.MkenContentHotels; },
  travel: function () { return window.MkenContentTravel; },
  events: function () { return window.MkenContentEvents; },
  commerce: function () { return window.MkenContentCommerce; },
  hockey: function () { return window.MkenContentHockey; },
  tailoring: function () { return window.MkenContentTailoring; },
};

window.MkenUiProfile = {
  get: function (profileId) {
    return window.MkenUiProfiles[profileId] || window.MkenUiProfiles['field-service'];
  },
  getContent: function (activityId) {
    var fn = window.MkenContentRegistry[activityId];
    return fn ? fn() : window.MkenContentMaintenance;
  },
};
