
// TODO: add handler for global error
// TODO: add custom rpc method
// TODO: add support send file
// TODO: add targets on server
// TODO: minify key for data object

import get_uuid from './get_uuid.js';
import TurboError from './TurboError.js';
import Wire from './Wire.js';

const STORE = { ws: null };
const hash_controller = {};
const hash_request = {};

export default class Turbo {
  constructor({ url, stimulus, spinner }) {
    this._url = url;
    this._stimulus = stimulus;
    this._spinner = spinner;
    this._EXIST_CONNECT = false;
  }

  start() {
    const me = this;
    if (!me._EXIST_CONNECT) {
      me._EXIST_CONNECT = true;
      var wire = new Wire(STORE);
      var data = {
        url: me._url,
        wire,
        reconnect: function() {
          setTimeout(() => {
            console.log('try reconnect');
            create_connect({ url: me._url, wire, reconnect: data.reconnect }).then(set_ws).catch(err => console.log('Fail repeat connect', err));
          }, 1000);
        }
      };
      return create_connect(data).then(set_ws).then(ws => {
        const TurboController = get_turbo_controller(me._stimulus, wire, this._spinner);
        return {
          TurboController,
          wire,
          createControllers(application, list) { _autoCreateControllers(TurboController, application, list) }
        };
      }).catch(err => console.log('Fail first connect', err));
    }
  }

}


function set_ws(ws) {
  STORE.ws = ws;
}

function _autoCreateControllers(TurboController, application, list) {
  list.forEach(el => {
    application.register(el, class extends TurboController {});
  });
}



function create_connect({ url, wire, reconnect }) {
  return new Promise((resolve, reject) => {
    let ws = new WebSocket(url, ['TEST']);

    ws.onopen = function() {
      console.log("Соединение установлено.");
      resolve(ws);
    };

    ws.onclose = function(event) {
      reconnect();
    };

    ws.onmessage = function(event) {

      // console.log("Received " + event.data);
      try {
        var msg = JSON.parse(event.data);

        if (msg.c_ev) {
          return Wire.receive(msg);
        }

        // console.log({ msg });
        if (msg.event === 'replace') {
          apply_replace(msg);
        } else if (msg.event === 'remove') {
          apply_remove(msg);
        } else if (msg.event === 'append' || msg.event === 'prepend') {
          var $ctr = document.querySelector('[data-controller='+msg.controller+']');
          $ctr.insertAdjacentHTML(msg.event === 'append' ? 'beforeEnd' : 'afterBegin', msg.view.html);
        } else if (msg.event === 'patch') {
          apply_patch(msg);
        } else if (msg.event === 'reply') {
          apply_reply(msg);
        }
      } catch (err) {
        console.log('[turbo]', err);
      }
    };

    ws.onerror = function(error) {
      console.log("Ошибка ", error);
      reject(error);
    };
  });
}


function apply_replace(msg) {
  let $ctr;
  if (msg.key) {
    $ctr = Array.from(
      document.querySelectorAll('[data-controller='+msg.controller+']')
    ).find(el => el.getAttribute('data-t-key') === (msg.key+''));
  } else {
    $ctr = document.querySelector('[data-controller='+msg.controller+']');
  }
  $ctr.outerHTML = msg.view.html;
}

function apply_remove(msg) {
  if (msg.key) {
    let $ctrs = Array.from(document.querySelectorAll('[data-controller='+msg.controller+']'));
    let $el = $ctrs.find(el => el.getAttribute('data-t-key') === (msg.key+''));
    // TODO: add handler if not found
    $el.outerHTML = '';
  } else {
    let $ctr = document.querySelector('[data-controller='+msg.controller+']');
    $ctr.outerHTML = '';
  }
}

function apply_patch(msg) {
  let $ctr = hash_controller[msg.controller];
  if (msg.key) {
    $ctr = hash_controller[msg.controller+'::'+msg.key];
  } else {
    $ctr = hash_controller[msg.controller];
  }
  if (!$ctr) {
    throw new Error(`Not found controller ${msg.controller} ${msg.key ? ` with key '${msg.key}'` : ''}`);
  }
  var $el = $ctr[msg.target+'Target'];
  if (!$el) {
    throw new Error(`Not found target ${msg.target} for controller ${msg.controller}`);
  }
  let { style, ...other } = msg.props;
  if (style) {
    Object.keys(style).forEach(k => {
      $el.style[k] = style[k];
    });
  }
  Object.keys(other).forEach(k => {
    $el[k] = other[k];
  });
}


function apply_reply(msg) {
  if (msg.error) {
    let error = TurboError.createError(msg.error);
    hash_request[msg.id].reject({ error, msg });
  } else {
    hash_request[msg.id].resolve(msg);
  }
}


function get_turbo_controller(stimulus, wire, spinnerData) {

  return class TurboController extends stimulus.Controller {

    constructor(data, option) {
      super(data);

      if (this.settings().disableSubmit) {
        this.element.onsubmit = function (e) {
          e.preventDefault();
        };
      }

      this._wire = wire;

      var controller = this._controller = this.element.getAttribute('data-controller');

      var methods = Array.from(this.element.querySelectorAll('[data-action]'))
        .map(el => el.getAttribute('data-action'))
        .map(el => el.split('->')[1])
        .map(el => el.split('#')[1])
      ;

      methods.forEach(method => {
        if (this[method]) {
          return;
        }
        this[method] = function (e) {
          this.mtd({ method, e, autoHandleError: true });
        };
      });
    }

    settings() {
      return {
        disableSubmit: false,
      }
    }

    get wire() {
      return this._wire;
    }

    get ws() {
      return STORE.ws;
    }

    mtd({ controller, method, e, targets, autoHandleError = false }) {
      const me = this;
      var dataset = JSON.parse(JSON.stringify(this.element.dataset));
      delete dataset.controller;

      targets = targets || this._get_targets();

      var body = {
        path: `${controller || this._controller}.${method}`,
        dataset,
        targets,
        e: { dataset: e.target.dataset },
        id: get_uuid()+'_'+Date.now(),
      };
      console.log('to [WS] => ', body);

      const spinner = new Spinner({
        getController: () => {
          if (spinnerData) {
            return me._get_controller(spinnerData.controllerName);
          } else {
            return {
              hide: () => {},
              show: () => {}
            };
          }
        }
      });

      var p = new Promise((resolve, reject) => {
        const start = Date.now();
        this.ws.send(JSON.stringify(body));
        hash_request[body.id] = { resolve, reject, controller: this, start };
        spinner.show(start);
      }).then(res => {
        // console.log('Duration', (Date.now() - hash_request[data.id].start));
        console.log('REPLY', res);

        spinner.hide();

        hash_request[body.id] = null;
        return res;
      }).catch(data_with_error => {
        // console.log('Duration', Date.now() - hash_request[data.msg.id].start);

        hash_request[body.id] = null;

        spinner.hide();

        if (autoHandleError) {
          this.handleError(data_with_error);
        } else {
          throw data_with_error;
        }
      });

      return p;
    }

    _get_controller(identifier) {
      return this.application.controllers.find(controller => {
        return controller.context.identifier === identifier;
      });
    }


    _get_targets() {
      const targets = {};
      let targets_keys = Object.getOwnPropertyNames(Object.getPrototypeOf(this))
        .filter(k => /Target$/.test(k))
        .filter(k => !/^has/.test(k))
      ;
      targets_keys.forEach(k => {
        var target = this[k];

        targets[k.replace(/Target$/, '')] = {
          value: this[k].value,
        };

        // if (target.nodeName === 'INPUT' && target.type === 'file') {
        //   targets[k.replace(/Target$/, '')] = {
        //     is_file: true,
        //     value: this[k].value,
        //   };
        // } else {

        // }
      });
      return targets;
    }

    connect() {
      var key = this.element.getAttribute('data-t-key') || '';
      hash_controller[this._controller+(key ? ('::'+key) : '')] = this;
    }

    disconnect() {
      var key = this.element.getAttribute('data-t-key') || '';
      hash_controller[this._controller+(key ? ('::'+key) : '')] = null;
    }

    handleError({ error, msg }) {
      console.log('handleError', error, msg);
    }
  }
}



class Spinner {
  constructor({ getController }) {
    this._getController = getController;

    this._check_duration = null;
    this._show_loader = false
    this._start_loader_time = null;
  }

  show(start_time_for_request) {
    const me = this;
    me._check_duration = setInterval(() => {
      if (!me._show_loader && (Date.now() - start_time_for_request) > 400) {
        me._show_loader = true;
        this._getController().show();
        me._start_loader_time = Date.now();
      }
    }, 100);
  }

  hide() {
    const me = this;
    const lag_time = 100;
    if ((Date.now() - me._start_loader_time) > lag_time) {
      clearInterval(me._check_duration);
      me._show_loader = false;
      this._getController().hide();
    // getting rid of flickering
    } else {
      setTimeout(() => {
        clearInterval(me._check_duration);
        me._show_loader = false;
        this._getController().hide();
      }, 400);
    }
  }
}






