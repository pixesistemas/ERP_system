const OperationExtractor = require("./operationExtractor");

const CustomerExtractor = require("./customerExtractor");

const ProductExtractor = require("./productExtractor");

const PaymentExtractor = require("./paymentExtractor");

const DiscountExtractor = require("./discountExtractor");

const DocumentExtractor = require("./documentExtractor");

const DateExtractor = require("./dateExtractor");

/*
 * Ejecuta todos los extractores sobre el mismo mensaje.
 */
class EntityExtractor {
  /*
   * Devuelve todas las entidades comerciales detectadas.
   */
  extract(message) {
    return {
      operation: OperationExtractor.extract(message),

      customerText: CustomerExtractor.extract(message),

      products: ProductExtractor.extract(message),

      payment: PaymentExtractor.extract(message),

      discount: DiscountExtractor.extract(message),

      sourceDocument: DocumentExtractor.extract(message),

      deliveryDate: DateExtractor.extract(message),
    };
  }
}

module.exports = new EntityExtractor();
