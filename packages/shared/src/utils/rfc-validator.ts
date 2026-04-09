// RFC validation for Mexican tax ID
// Persona Moral: 3 letters + 6 digits (date) + 3 alphanumeric (homoclave) = 12
// Persona Física: 4 letters + 6 digits (date) + 3 alphanumeric (homoclave) = 13

const RFC_MORAL_REGEX = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/;
const RFC_FISICA_REGEX = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/;
const RFC_GENERICO = "XAXX010101000"; // Público en general
const RFC_EXTRANJERO = "XEXX010101000"; // Extranjero

export function validateRFC(rfc: string): {
  valid: boolean;
  type: "moral" | "fisica" | "generico" | "extranjero" | null;
  error?: string;
} {
  const cleaned = rfc.toUpperCase().trim();

  if (cleaned === RFC_GENERICO) {
    return { valid: true, type: "generico" };
  }

  if (cleaned === RFC_EXTRANJERO) {
    return { valid: true, type: "extranjero" };
  }

  if (cleaned.length === 12 && RFC_MORAL_REGEX.test(cleaned)) {
    return { valid: true, type: "moral" };
  }

  if (cleaned.length === 13 && RFC_FISICA_REGEX.test(cleaned)) {
    return { valid: true, type: "fisica" };
  }

  return {
    valid: false,
    type: null,
    error: "RFC inválido. Debe ser 12 caracteres (persona moral) o 13 (persona física)",
  };
}
