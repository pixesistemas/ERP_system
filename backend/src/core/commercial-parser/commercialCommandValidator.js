const Types = require("./commandTypes");

/*
 * Determina si un CommercialCommand tiene
 * suficiente información para ejecutarse.
 */
class CommercialCommandValidator {
  /*
   * Valida el comando completo.
   */
  validate(command) {
    const errors = [];
    const missing = [];
    const warnings = [];

    if (!command) {
      return {
        valid: false,
        executable: false,
        errors: [
          {
            field: "command",
            code: "COMMAND_REQUIRED",
            message: "El comando comercial es obligatorio.",
          },
        ],
        missing: [],
        warnings: [],
      };
    }

    if (!command.operation || command.operation === Types.UNKNOWN) {
      missing.push({
        field: "operation",
        code: "OPERATION_REQUIRED",
        message: "Falta indicar la operación comercial.",
      });
    }

    /*
     * Las conversiones pueden ejecutarse
     * utilizando solamente el documento origen.
     */
    const isDocumentConversion = Boolean(command.sourceDocument);

    if (!isDocumentConversion && !command.hasCustomer()) {
      missing.push({
        field: "customer",
        code: "CUSTOMER_REQUIRED",
        message: "Falta indicar el cliente.",
      });
    }

    if (!isDocumentConversion && !command.hasProducts()) {
      missing.push({
        field: "products",
        code: "PRODUCTS_REQUIRED",
        message: "Falta indicar al menos un producto.",
      });
    }

    for (let index = 0; index < command.products.length; index += 1) {
      const product = command.products[index];

      if (!product.description) {
        errors.push({
          field: `products.${index}.description`,
          code: "PRODUCT_DESCRIPTION_REQUIRED",
          message: `El producto ${index + 1} no tiene descripción.`,
        });
      }

      if (
        !Number.isFinite(Number(product.quantity)) ||
        Number(product.quantity) <= 0
      ) {
        errors.push({
          field: `products.${index}.quantity`,
          code: "INVALID_PRODUCT_QUANTITY",
          message: `La cantidad del producto ${index + 1} no es válida.`,
        });
      }
    }

    if (
      command.discount &&
      (!Number.isFinite(Number(command.discount.value)) ||
        Number(command.discount.value) < 0 ||
        Number(command.discount.value) > 100)
    ) {
      errors.push({
        field: "discount.value",
        code: "INVALID_DISCOUNT",
        message: "El descuento debe estar entre 0 y 100.",
      });
    }

    if (!command.payment) {
      warnings.push({
        field: "payment",
        code: "PAYMENT_NOT_DEFINED",
        message: "No se indicó condición de pago.",
      });
    }

    return {
      valid: errors.length === 0,

      executable: errors.length === 0 && missing.length === 0,

      errors,
      missing,
      warnings,
    };
  }
}

module.exports = new CommercialCommandValidator();
