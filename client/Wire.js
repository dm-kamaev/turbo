const namespaces = {};

export default class Wire {

  static receive(msg) {
    const [ namespace_name, ev_name ] = msg.c_ev.split('.');
    const namespace = namespaces[namespace_name] || namespaces['default'];
    namespace.dispatch(msg);
  }

  constructor(store, namespace) {
    this._store = store;
    this._listeners = {};
    this._namespace = namespace || 'default';
    namespaces[this._namespace] = this;
  }

  namespace(namespace) {
    const wire = new Wire(this._store, namespace);
    return wire;
  }

  get ws() { return this._store.ws; }

  emit(name, data) {
    // CLOSING
    if (this.ws.readyState === 3) {
      throw new Error('Connection is closing');
    }
    this.ws.send(JSON.stringify({ c_ev: this._get_c_ev(name), data }));
  }

  on(input_name, cb){
    var name = this._get_c_ev(input_name);
    if (!this._listeners[name]) {
      this._listeners[name] = [];
    }
    this._listeners[name].push(cb);
  }

  dispatch(msg) {
    const ev_name = msg.c_ev;
    if (!this._listeners[ev_name]) {
      throw new Error('Not found listeners for '+ev_name);
    }

    for (var i = 0, l = this._listeners[ev_name].length; i < l; i++) {
      this._listeners[ev_name][i](msg.data);
    }
  }

  _get_c_ev(name) {
    if (this._namespace) {
      return this._namespace+'.'+name;
    } else {
      return name;
    }
  }
};