const EventEmitter = require("events");

class EventBus extends EventEmitter {
  emitEvent(eventName, payload) {
    console.log(`[EVENT] ${eventName}`);
    this.emit(eventName, payload);
  }

  listen(eventName, handler) {
    this.on(eventName, handler);
  }
}

module.exports = new EventBus();
