'use strict';

module.exports = class TurboError extends Error {
  constructor(msg) {
    super(msg);
  }

  toJSON() {
    return { message: this.message };
  }
}


