import Ember from 'ember';
import Mixin from '@ember/object/mixin';
import { assert } from '@ember/debug';

export default Mixin.create({
  visibilityHandler() {
    assert('visibilityHandler needs to be overridden in the Component', false);
  },

  setupDocumentVisibility: function() {
    if (!Ember.testing) {
      this.set('_visibilityHandler', this.visibilityHandler.bind(this));
      document.addEventListener('visibilitychange', this._visibilityHandler);
    }
  }.on('init'),

  removeDocumentVisibility: function() {
    if (!Ember.testing) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
    }
  }.on('willDestroy'),
});
