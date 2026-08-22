import { Matches, ValidationOptions } from 'class-validator';

export const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function IsUuidLike(validationOptions?: ValidationOptions) {
  return Matches(UUID_REGEX, {
    ...validationOptions,
    message: validationOptions?.message ?? '$property must be a UUID',
  });
}
