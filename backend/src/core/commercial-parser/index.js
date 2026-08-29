/*
 * Punto único de entrada al Commercial Parser.
 */
module.exports = {
  Parser: require("./commercialParser"),

  Command: require("./commercialCommand"),

  Validator: require("./commercialCommandValidator"),

  EntityExtractor: require("./entityExtractor"),

  Types: require("./commandTypes"),

  DocumentTypes: require("./documentTypes"),

  PaymentTypes: require("./paymentTypes"),

  Normalizer: require("./normalizer"),

  NumberParser: require("./numberParser"),

  OperationExtractor: require("./operationExtractor"),

  CustomerExtractor: require("./customerExtractor"),

  ProductExtractor: require("./productExtractor"),

  PaymentExtractor: require("./paymentExtractor"),

  DiscountExtractor: require("./discountExtractor"),

  DocumentExtractor: require("./documentExtractor"),

  DateExtractor: require("./dateExtractor"),
};
