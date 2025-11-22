import { validate as validateUUID } from "uuid";

/**
 * 验证 UUID 格式
 */
export const validateKey = (key: string): void => {
  if (!validateUUID(key)) {
    throw new Error(`Invalid UUID key: ${key}. Key must be a valid UUID.`);
  }
};

