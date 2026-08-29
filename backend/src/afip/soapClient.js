const soap = require("soap");

class SOAPClient {
  async connect(wsdl, url) {
    return await soap.createClientAsync(wsdl, {
      endpoint: url,
    });
  }
}

module.exports = SOAPClient;
