const WebSocket = require('ws');

const Sock = require('./Sock.js');

const turbo = module.exports;

turbo.TurboError = require('./TurboError.js');

turbo.init = function ({ server, controllers, handleError }) {
  const wss = new WebSocket.Server({ server });

  // wss.on('headers', function(headers) {
  //   console.log('ON', { headers });
  //   // headers["set-cookie"] = "SESSIONID=" + crypto.randomBytes(20).toString("hex");
  //   // console.log("handshake response cookie", headers["set-cookie"]);
  // });

  wss.on('connection', function (ws, req) {
    // TODO: use Symbol
    ws.__sock = new Sock(ws, req);
    // setInterval(() => {
    //   console.log(Array.from(wss.clients).filter(el => el.readyState === WebSocket.OPEN).length);
    // }, 10000);
    ws.on('message', async function (message) {
      console.log('received: %s', message);
      try {
        var msg = JSON.parse(message);
        let [ controller_name, method ] = msg.path.split('.');
        var controller = controllers[controller_name];
        if (!controller || !(controller instanceof Controller)) {
          throw new Error(`Not found controller "${controller_name}"`);
        }

        var data = await controller.exec(method, ws.__sock, { dataset: msg.dataset, targets: msg.targets, e: msg.e });
        ws.__sock.reply({ path: msg.path, data: data || null, id: msg.id });
      } catch (err) {
        var error;
        if (err instanceof turbo.TurboError) {
          error = JSON.stringify(err);
        } else {
          error = err.message;
        }
        ws.__sock.reply({ path: msg.path, error, id: msg.id });
        handleError ? handleError(err) : console.log(err);
      }
    });
  });

  return { server, wss };
}


turbo.Controller = function (name) {
  return new Controller(name);
};


class Controller {

  constructor(name) {
    this._name = name;
    this._middlewares = [];
    this._hash_method = {};
  }

  set(method, ...other) {
    var action = other.pop();
    this._hash_method[method] = action;
    this._middlewares = other;
    return this;
  }

  async exec(method, sock, data) {
    if (!this._hash_method[method]) {
      throw new Error(`Not found method "${method}" on controller ${this._name}`);
    }

    for await (var el of this._middlewares) {
      const result = await el(sock, data);
      if (result instanceof Error) {
        throw result;
      }
    }

    return await this._hash_method[method](sock, data);
  }
}