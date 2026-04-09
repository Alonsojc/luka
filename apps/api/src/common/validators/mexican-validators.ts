import {
  registerDecorator,
  ValidationOptions,
} from "class-validator";

export function IsRFC(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isRFC",
      target: object.constructor,
      propertyName,
      options: {
        message: "RFC invalido. Formato: 3-4 letras + 6 digitos + 3 alfanumericos",
        ...validationOptions,
      },
      validator: {
        validate(value: any) {
          if (typeof value !== "string") return false;
          return /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(value);
        },
      },
    });
  };
}

export function IsCURP(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isCURP",
      target: object.constructor,
      propertyName,
      options: {
        message: "CURP invalido. Debe tener 18 caracteres con formato valido",
        ...validationOptions,
      },
      validator: {
        validate(value: any) {
          if (typeof value !== "string") return false;
          return /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(value);
        },
      },
    });
  };
}

export function IsNSS(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isNSS",
      target: object.constructor,
      propertyName,
      options: {
        message: "NSS invalido. Debe ser un numero de 11 digitos",
        ...validationOptions,
      },
      validator: {
        validate(value: any) {
          if (typeof value !== "string") return false;
          return /^\d{11}$/.test(value);
        },
      },
    });
  };
}

export function IsCLABE(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isCLABE",
      target: object.constructor,
      propertyName,
      options: {
        message: "CLABE invalida. Debe ser un numero de 18 digitos",
        ...validationOptions,
      },
      validator: {
        validate(value: any) {
          if (typeof value !== "string") return false;
          return /^\d{18}$/.test(value);
        },
      },
    });
  };
}

export function IsPostalCodeMX(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isPostalCodeMX",
      target: object.constructor,
      propertyName,
      options: {
        message: "Codigo postal invalido. Debe ser un numero de 5 digitos",
        ...validationOptions,
      },
      validator: {
        validate(value: any) {
          if (typeof value !== "string") return false;
          return /^\d{5}$/.test(value);
        },
      },
    });
  };
}

export function IsPhoneMX(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isPhoneMX",
      target: object.constructor,
      propertyName,
      options: {
        message: "Telefono invalido. Debe ser un numero de 10 digitos",
        ...validationOptions,
      },
      validator: {
        validate(value: any) {
          if (typeof value !== "string") return false;
          return /^\d{10}$/.test(value);
        },
      },
    });
  };
}
