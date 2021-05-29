
export default class TurboError extends Error {

  static createError(err) {
    try {
      err = JSON.parse(err);
      let { message, ...other } = err;
      return new TurboError(message).setFields(other);
    } catch (e) {
      return new TurboError(err);
    }
  }

  constructor(msg) {
    super(msg);
  }

  setFields(other) {
    Object.keys(other).forEach(k => {
      this[k] = other[k];
    });
    return this;
  }
};