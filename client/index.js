
// TODO: add support send file
// TODO: handler for slow signal
// TODO: add targets on server
// TODO: minify key for data object

import get_uuid from './get_uuid.js';
import TurboError from './TurboError.js';

const STORE = { ws: null };
const hash_controller = {};
const hash_request = {};

export default function ({ url, stimulus }) {
  let EXIST_CONNECT = false;
  if (!EXIST_CONNECT) {
    EXIST_CONNECT = true;
    var data = {
      url,
      reconnect: function() {
        setTimeout(() => {
          console.log('try reconnect');
          create_connect({ url, reconnect: data.reconnect }).then(set_ws).catch(err => console.log('Fail repeat connect', err));
        }, 1000);
      }
    };
    return create_connect(data).then(set_ws).then(() => {
      let TurboController = get_turbo_controller(stimulus);
      return {
        TurboController,
        createTurboController(application, list) { _createTurboController(TurboController, application, list) }
      };
    }).catch(err => console.log('Fail first connect', err));
  }
}

function _createTurboController(TurboController, application, list) {
  list.forEach(el => {
    application.register(el, class extends TurboController {});
  });
}

function set_ws(ws) { STORE.ws = ws; }

function create_connect({ url, reconnect }) {
  return new Promise((resolve, reject) => {
    let ws = new WebSocket(url);

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
        console.log(err);
      }
    };

    ws.onerror = function(error) {
      console.log("Ошибка ", error);
      reject(error);
    };

    return ws;
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


function get_turbo_controller(stimulus) {

  return class TurboController extends stimulus.Controller {

    constructor(data, option) {
      super(data);

      if (option && option.disableSubmit) {
        this.element.onsubmit = function (e) {
          e.preventDefault();
        };
      }

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


    get ws() {
      return STORE.ws;
    }

    mtd({ controller, method, e, targets, autoHandleError = false }) {

      var dataset = JSON.parse(JSON.stringify(this.element.dataset));
      delete dataset.controller;

      var body = {
        path: `${controller || this._controller}.${method}`,
        dataset,
        targets: targets || this._get_targets(),
        e: { dataset: e.target.dataset },
        id: get_uuid()+'_'+Date.now(),
      };
      console.log('to [WS] => ', body);
      // var check_duration;
      var p = new Promise((resolve, reject) => {
        var start = Date.now();
        this.ws.send(JSON.stringify(body));
        hash_request[body.id] = { resolve, reject, controller: this, start };
        // check_duration = setInterval(() => {
        //   if (Date.now() - hash_request[data.id].start > 400) {
        //     console.log('SHOW LOADER');
        //   }
        // }, 100);
      }).then(res => {
        // console.log('Duration', (Date.now() - hash_request[data.id].start));
        console.log('REPLY', res);
        hash_request[body.id] = null;
        return res;
        // clearInterval(check_duration);
      });

      if (autoHandleError) {
        p.catch(data_with_error => {
          // console.log('Duration', Date.now() - hash_request[data.msg.id].start);
          console.log('CATCH', data_with_error);
          this.handleError(data_with_error);
          hash_request[body.id] = null;
          // clearInterval(check_duration);
        });
      }

      return p;
    }


    _get_targets() {
      const targets = {};
      let targets_keys = Object.getOwnPropertyNames(Object.getPrototypeOf(this))
        .filter(k => /Target$/.test(k))
        .filter(k => !/^has/.test(k))
      ;
      targets_keys.forEach(k => {
        targets[k.replace(/Target$/, '')] = {
          value: this[k].value,
        };
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






