const SECURE_UUID_ERROR =
  'Secure UUID generation is unavailable. Use a browser with Web Crypto support over HTTPS.';

export const createSecureUuid = (): string => {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) {
    throw new Error(SECURE_UUID_ERROR);
  }
  if (typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  if (typeof cryptoApi.getRandomValues !== 'function') {
    throw new Error(SECURE_UUID_ERROR);
  }

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
};
