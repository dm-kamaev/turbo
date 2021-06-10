

export default class Spinner {
  constructor({ getController }) {
    this._getController = getController;

    this._check_duration = null;
    this._show_loader = false
    this._start_loader_time = null;
  }

  show(start_time_for_request, ws) {
    const me = this;
    // CLOSING
    if (ws.readyState === 3) {
      return;
    }
    me._check_duration = setInterval(() => {
      if (!me._show_loader && (Date.now() - start_time_for_request) > 450) {
        me._show_loader = true;
        me._getController().show();
        me._start_loader_time = Date.now();
      }
    }, 100);
  }

  hide() {
    const me = this;
    const lag_time = 200;
    if ((Date.now() - me._start_loader_time) > lag_time) {
      clearInterval(me._check_duration);
      me._show_loader = false;
      me._getController().hide();
    // getting rid of flickering
    } else {
      setTimeout(() => {
        clearInterval(me._check_duration);
        me._show_loader = false;
        me._getController().hide();
      }, 400);
    }
  }
}






