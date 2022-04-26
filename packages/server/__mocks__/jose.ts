declare const vi;

export const createRemoteJWKSet = vi.fn();

export const exportJWK = vi.fn(() => ({
  kty: 'RSA',
  n: 'tnbzzKFPdD64R-D_g7oAo4tdOP3nPUQyxF-G7N9B4g2FcH7gEv0NgmNOrfKA8155SHYeYB2y9fi4Y3H7WvJEn8hY6a9YB6CFS6yxZSNzC_Ld9_7j6Uz3uhvdfMz_wOM-eP4iFFGOw0H2ArQJiOi-_5GDXrrxTYLVJ32xn6MySTSdczcwRRGzaUFbfTeQJYHSoeytwh26bu2UHt63LpKFchrSIucTo_ALujY3YEK4bmvumuMJsLxW5WZzBpZ6qN-8eyuMUVzhKGKVY2FrECYQF4gBQMYJcEld-Kk_IXQnyNrel__6FXCh2J-Sy3MdQm1P_S8h0BtGIlpkoOT8E0iGSQ',
  e: 'AQAB',
  d: 'Vb8Exy8vNYOb-jtkGDU6w6BkiLnZB1ObP-lccMhiH6cXBEy7ZHEC_jlI6jnCG5xUBpdrouOSDEF79U_FPXIIicYO8pJyHfNzcKKRIuRL1lulsDtaQ3LmH9GkflegALdJznYu8bl6C4xd3dtZd7tYtqVdRRE5AKHxJYPOCyUYJooGEo6mSU3_jDGjycBUOnkPq-iH9g3rljLqNWfNXzRCMzB1GoaFMA6r06HQ3Z8jEL36eYf2kQdV5ysz_-nszTrY6olgYHrukqIr4I77YXDJd9fo8Ide5kwznoKYauDeSC8zmcigsildtmz95RXaAHpuRXrO83r0EeRKfXPBh3UA4Q',
  p: '3q1JHMio2ApDQ6CB0RbMI7xZvJrbFpQDBHWAn1Nv8qW9BCMpiXSpiTGk8xeggjfDoBb12NwjtsTaAf5nQPLsNXekuQiRVCnJyRzZpv8LCWHNAaPFi9mtsf5_3CEXLKfN-zDejLeJ6-RC-9jzC7-B2idZ9vrJ5kZRfVBDrJxqiQ0',
  q: '0cUkg6KLMipuymFwSh1HVC-I1d4lneLPBxbKJUv8JIQpM9UNSii6AD69v-hpSK8tE3xonCIRJSKeEgOQQaXLk96eMRSqpGfGC6RRgREWaeccOnoSRFHfmZnrwI02Jzmb5MZFO3hiKj6M_1TiysFGRgHpaY4Q9VsxNvcBcQTeay0',
  dp: 'hFyk1QNBugl_qjdCczMF7UgMX1v9VxJsKL5f0lUaejWigU8VZat_CxoDXqxwsHbNRd_gCyPv5rhkjkLWxXigh7eypno9SLX-SBlqFyYLPWxxG8RprJOb9-27uvHAgL7OZb3KzAJdbWalmmZ_MkCHw1EY3QJ9-O9biQ2o7HWdrhE',
  dq: 'pdEdnQR23a_XJhlB5wQf5zcwBkb1G0o3dpYYMsVOyhrCaxuFxtJMvXbbDYENAIygqB-WnZz8SouDwh-Y_5usQfYevBNnFFCHp5o7Zzf3rL0ofj0ShXjmtIeMaQf2_6i1R3FHNsxhZJ1PXWJfaADBqQNH282WMCzmyVkVhZ5gpv0',
  qi: 'Kkj3S9LAl5bLiFqM8PK_GEo9EwR7R0g9LJdmjqpHEGDki1wJZw0BxhXIvF8GqtE9Lg3dhn_2gwjDucEOWv14DpfrZwgWA1InrtjMnF7K0yvPQJRxUF7zPOQwTwYpLlusxeMxsupyodS_335bOHZaquxD8QJRkNl38FnSAVXmwXg',
}));

export const generateKeyPair = vi.fn(() => ({
  publicKey: {},
  privateKey: {},
}));

export const importJWK = vi.fn(() => ({}));

export const jwtVerify = vi.fn((credential: string) => {
  if (credential === 'invalid') {
    throw new Error('Verification failed');
  }
  return {
    payload: {
      // By convention for tests, return the credential as the email
      // Obviously in the real world the credential would be a JWT
      // And the Google Auth service returns the corresponding email
      email: credential,
    },
  };
});

export class SignJWT {
  setProtectedHeader(): this {
    return this;
  }
  setIssuedAt(): this {
    return this;
  }
  setIssuer(): this {
    return this;
  }
  setAudience(): this {
    return this;
  }
  setExpirationTime(): this {
    return this;
  }
  sign(): string {
    return 'x';
  }
}
