'use strict';

module.exports = class Wire {
  constructor(ws, req) {
    this._ws = ws;
    this._req = req;
  }

  get headers() {
    return this._req.headers;
  }

  replace({ controller, key, view }) {
    var data = {
      event: 'replace',
      controller,
      key,
      view: typeof view === 'string' ? { html: view } : view,
    };
    this._ws.send(JSON.stringify(data));
  }

  append({ controller, view }) {
    var data = {
      event: 'append',
      controller,
      view: typeof view === 'string' ? { html: view } : view,
    };
    this._ws.send(JSON.stringify(data));
  }

  prepend({ controller, view }) {
    var data = {
      event: 'prepend',
      controller,
      view: typeof view === 'string' ? { html: view } : view,
    };
    this._ws.send(JSON.stringify(data));
  }


  remove({ controller, key }) {
    var data = {
      event: 'remove',
      key,
      controller,
    };
    this._ws.send(JSON.stringify(data));
  }


  patch({ controller, key, target, props }) {
    var data = {
      event: 'patch',
      controller,
      key,
      target,
      props
    };
    this._ws.send(JSON.stringify(data));
  }


  reply({ controller, method, error, data, id }) {
    var data = {
      event: 'reply',
      controller,
      method,
      error,
      data,
      id,
    };
    this._ws.send(JSON.stringify(data));
  }


  emit(name, data) {
    this._ws.send(JSON.stringify({ c_ev: name, data }));
  }
}


