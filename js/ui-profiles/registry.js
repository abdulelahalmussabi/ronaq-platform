/**
 * سجل قوالب الواجهة — يربط uiProfile بكل نشاط
 */
window.RonaqUiProfiles = {
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

window.RonaqContentRegistry = {
  maintenance: function () { return window.RonaqContentMaintenance; },
  'tech-digital': function () { return window.RonaqContentTechDigital; },
  'it-support': function () { return window.RonaqContentItSupport; },
  cleaning: function () { return window.RonaqContentCleaning; },
  renovation: function () { return window.RonaqContentRenovation; },
  security: function () { return window.RonaqContentSecurity; },
  training: function () { return window.RonaqContentTraining; },
  'barber-salon': function () { return window.RonaqContentBarberSalon; },
  'car-care': function () { return window.RonaqContentCarCare; },
  healthcare: function () { return window.RonaqContentHealthcare; },
  'spa-wellness': function () { return window.RonaqContentSpaWellness; },
  fitness: function () { return window.RonaqContentFitness; },
  veterinary: function () { return window.RonaqContentVeterinary; },
  restaurant: function () { return window.RonaqContentRestaurant; },
  consulting: function () { return window.RonaqContentConsulting; },
  photography: function () { return window.RonaqContentPhotography; },
  tutoring: function () { return window.RonaqContentTutoring; },
  hotels: function () { return window.RonaqContentHotels; },
  travel: function () { return window.RonaqContentTravel; },
  events: function () { return window.RonaqContentEvents; },
  commerce: function () { return window.RonaqContentCommerce; },
};

window.RonaqUiProfile = {
  get: function (profileId) {
    return window.RonaqUiProfiles[profileId] || window.RonaqUiProfiles['field-service'];
  },
  getContent: function (activityId) {
    var fn = window.RonaqContentRegistry[activityId];
    return fn ? fn() : window.RonaqContentMaintenance;
  },
};
