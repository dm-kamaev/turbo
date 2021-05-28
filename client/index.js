
// TODO: handler for format error
// TODO: handler for slow signal
// TODO: add targets on server

import * as stimulus from 'stimulus';

const STORE = { ws: null };
const hash_controller = {};
const hash_request = {};

export default function ({ url }) {
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
    create_connect(data).then(set_ws).catch(err => console.log('Fail first connect', err));
  }
  return { TurboController, createTurboController };
}

function createTurboController(application, list) {
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
      // ws.send('From client');
      resolve(ws);
    };

    ws.onclose = function(event) {
      reconnect();
      // if (event.wasClean) {
      //   console.log('Соединение закрыто чисто');
      // } else {
      //   console.log('Обрыв соединения'); // например, "убит" процесс сервера
      // }
      // console.log('Код: ' + event.code + ' причина: ' + event.reason);
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
          if (msg.error) {
            hash_request[msg.id].reject({ error: msg.error, msg });
          } else {
            hash_request[msg.id].resolve(msg);
          }
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


class TurboController extends stimulus.Controller {

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
        this.mtd({ method, e });
      };
    });
  }


  get ws() {
    return STORE.ws;
  }

  mtd({ controller, method, e }) {

    var dataset = JSON.parse(JSON.stringify(this.element.dataset));
    delete dataset.controller;

    var body = {
      path: `${controller || this._controller}.${method}`,
      dataset,
      targets: this._get_targets(),
      e: { dataset: e.target.dataset },
      id: get_uuid()+'_'+Date.now(),
    };
    console.log('to [WS] => ', body);
    // var check_duration;
    return new Promise((resolve, reject) => {
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
    }).catch(data => {
      // console.log('Duration', Date.now() - hash_request[data.msg.id].start);
      console.log('CATCH');
      this.handleError(data);
      hash_request[body.id] = null;
      // clearInterval(check_duration);
    });
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
    console.log('Error', error, msg);
  }
}



const get_uuid = (function () {
  var IDX = 36, HEX='';
  while (IDX--) {
    HEX += IDX.toString(36);
  }

  return function (len) {
    var str = '';
    var num = len || 11;
    while (num--) {
      str += HEX[Math.random() * 36 | 0];
    }
    return str;
  };
}());
