const WebSocket = require('ws');

const Wire = require('./Wire.js');



const Turbo = module.exports = class Turbo {
  constructor(option = { debug: false }) {
    this._controllers = {};
    this._controllerEvents = {};
    this._handleError = null;
    this._log = option.debug ? console.log : () => {};
  }

  setControllers(...controllers) {
    controllers.forEach(el => {
      this._controllers[el.namespace] = el;
    });
  }

  setControllerEvents(...controllerEvents) {
    controllerEvents.forEach(el => {
      this._controllerEvents[el.namespace] = el;
    });
  }

  setHandleError(handleError) {
    this._handleError = handleError;
  }

  start({ server, verifyClient }) {
    const controllers = this._controllers;
    const controllerEvents = this._controllerEvents;
    const handleError = this._handleError;
    const me = this;

    const wss = new WebSocket.Server({
      server,
      verifyClient
      // verifyClient: function(info, done) {
        // let query = url.parse(info.req.url, true).query;
        // jwt.verify(query.token, config.jwt.secret, function(err, decoded) {
        //   if (err) return done(false, 403, 'Not valid token');

        //   // Saving the decoded JWT on the client would be nice
        //   done(true);
      // }
    });

    // wss.on('headers', function(headers) {
    //   console.log('ON', { headers });
    //   // headers["set-cookie"] = "SESSIONID=" + crypto.randomBytes(20).toString("hex");
    //   // console.log("handshake response cookie", headers["set-cookie"]);
    // });

    wss.on('connection', function (ws, req) {
      // TODO: use Symbol
      var wire = ws.__wire = new Wire(ws, req);
      // setInterval(() => {
      //   console.log(Array.from(wss.clients).filter(el => el.readyState === WebSocket.OPEN).length);
      // }, 10000);
      ws.on('message', async function (message) {
        me._log('received: %s', message);

        try {
          var msg = JSON.parse(message);
        // TODO: add handle error
        } catch (err) {
          return handleError ? handleError(err) : console.log(err);
        }

        if (!msg.c_ev) {
          await me._handle_controller(msg, ws.__wire);
        } else {
          try {
            await me._handle_custom_event(ws.__wire, msg);
          } catch (err) {
            return handleError ? handleError(err) : console.log(err);
          }
        }
      });
    });

    return { server, wss };
  }

  async _handle_controller(msg, wire) {
    const me = this;
    try {
      let [ controller_name, method ] = msg.path.split('.');
      var controller = me._controllers[controller_name];
      if (!controller || !(controller instanceof Controller)) {
        throw new Error(`Not found controller "${controller_name}"`);
      }

      var result = await controller.exec(method, wire, { dataset: msg.dataset || {}, targets: msg.targets || {}, e: msg.e });
      wire.reply({ path: msg.path, data: result || null, id: msg.id });
    } catch (err) {
      var error;

      me.handleError ? me.handleError(err) : console.log(err);

      if (err instanceof Turbo.TurboError) {
        error = JSON.stringify(err);
      } else {
        error = err.message;
      }
      wire.reply({ path: msg.path, error, id: msg.id });
    }
  }


  async _handle_custom_event(wire, { c_ev, data }) {
    const me = this;
    try {
      const [ namespace, ev_name ] = c_ev.split('.');
      const controller = me._controllerEvents[namespace];
      if (!controller || !(controller instanceof ControllerEvent)) {
        throw new Error(`Not found namespace "${namespace}" for event`);
      }
      await controller.exec(ev_name, wire, data);
    } catch (err) {
      me.handleError ? me.handleError(err) : console.log(err);
    }
  }

}

Turbo.TurboError = require('./TurboError.js');





Turbo.Controller = function (name, middlewares) {
  return new Controller(name, middlewares);
};


Turbo.ControllerEvent = function (namespace, middlewares) {
  return new ControllerEvent(namespace, middlewares);
};


class ControllerEvent {

  constructor(namespace, middlewares) {
    this._namespace = namespace;
    this._middlewares = middlewares ? middlewares : [];
    this._hash_event = {};
  }

  get namespace() {
    return this._namespace;
  }

  on(event, cb) {
    this._hash_event[event] = cb;
    this._hash_event[event] = { action: cb, middlewares: this._middlewares };
    return this;
  }

  async exec(event, wire, data) {
    let ev = this._hash_event[event];
    if (!ev) {
      throw new Error(`Not found event "${event}" on controller ${this._namespace}`);
    }

    for await (var el of ev.middlewares) {
      const result = await el(wire, data);
      if (result instanceof Error) {
        throw result;
      }
    }

    return await ev.action(wire, data);
  }
}


class Controller {

  constructor(name, middlewares) {
    this._name = name;
    this._middlewares = middlewares ? middlewares : [];
    this._hash_method = {};
  }

  get namespace() {
    return this._name;
  }

  on(method, ...other) {
    var action = other.pop();
    this._hash_method[method] = { action, middlewares: this._middlewares.concat(other) };
    return this;
  }

  async exec(method, wire, data) {
    let mth = this._hash_method[method];
    if (!mth) {
      throw new Error(`Not found method "${method}" on controller ${this._name}`);
    }

    for await (var el of mth.middlewares) {
      const result = await el(wire, data);
      if (result instanceof Error) {
        throw result;
      }
    }

    return await mth.action(wire, data);
  }
}