import { inject as service } from '@ember/service';
import Component from '@ember/component';
import { computed } from '@ember/object';
import { run } from '@ember/runloop';
import RSVP from 'rsvp';
import { task } from 'ember-concurrency';
import { logger } from 'nomad-ui/utils/classes/log';
import WindowResizable from 'nomad-ui/mixins/window-resizable';
import timeout from 'nomad-ui/utils/timeout';

export default Component.extend(WindowResizable, {
  token: service(),

  classNames: ['boxed-section', 'task-log'],

  allocation: null,
  task: null,

  // When true, request logs from the server agent
  useServer: false,

  // When true, logs cannot be fetched from either the client or the server
  noConnection: false,

  clientTimeout: 1000,
  serverTimeout: 5000,

  didReceiveAttrs() {
    if (this.allocation && this.task) {
      this.send('toggleStream');
    }
  },

  didInsertElement() {
    this.fillAvailableHeight();
  },

  windowResizeHandler() {
    run.once(this, this.fillAvailableHeight);
  },

  fillAvailableHeight() {
    // This math is arbitrary and far from bulletproof, but the UX
    // of having the log window fill available height is worth the hack.
    const cliWindow = this.$('.cli-window');
    cliWindow.height(window.innerHeight - cliWindow.offset().top - 25);
  },

  mode: 'stdout',

  logUrl: computed('allocation.id', 'allocation.node.httpAddr', 'useServer', function() {
    const address = this.get('allocation.node.httpAddr');
    const allocation = this.get('allocation.id');

    const url = `/v1/client/fs/logs/${allocation}`;
    return this.useServer ? url : `//${address}${url}`;
  }),

  logParams: computed('task', 'mode', function() {
    return {
      task: this.task,
      type: this.mode,
    };
  }),

  logger: logger('logUrl', 'logParams', function logFetch() {
    // If the log request can't settle in one second, the client
    // must be unavailable and the server should be used instead
    const timing = this.useServer ? this.serverTimeout : this.clientTimeout;
    return url =>
      RSVP.race([this.token.authorizedRequest(url), timeout(timing)]).then(
        response => response,
        error => {
          if (this.useServer) {
            this.set('noConnection', true);
          } else {
            this.send('failoverToServer');
            this.stream.perform();
          }
          throw error;
        }
      );
  }),

  head: task(function*() {
    yield this.get('logger.gotoHead').perform();
    run.scheduleOnce('afterRender', () => {
      this.$('.cli-window').scrollTop(0);
    });
  }),

  tail: task(function*() {
    yield this.get('logger.gotoTail').perform();
    run.scheduleOnce('afterRender', () => {
      const cliWindow = this.$('.cli-window');
      cliWindow.scrollTop(cliWindow[0].scrollHeight);
    });
  }),

  stream: task(function*() {
    this.logger.on('tick', () => {
      run.scheduleOnce('afterRender', () => {
        const cliWindow = this.$('.cli-window');
        cliWindow.scrollTop(cliWindow[0].scrollHeight);
      });
    });

    yield this.logger.startStreaming();
    this.logger.off('tick');
  }),

  willDestroy() {
    this.logger.stop();
  },

  actions: {
    setMode(mode) {
      this.logger.stop();
      this.set('mode', mode);
      this.stream.perform();
    },
    toggleStream() {
      if (this.get('logger.isStreaming')) {
        this.logger.stop();
      } else {
        this.stream.perform();
      }
    },
    failoverToServer() {
      this.set('useServer', true);
    },
  },
});
