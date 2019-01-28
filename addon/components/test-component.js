import Component from '@ember/component';
import layout from '../templates/components/test-component';

export default Component.extend({
  layout,
  classNames: ['foo', 'bar', 'item'],
  actions: {
    fileName() {

    },
    sendName(name, email) {

    }
  }
});
