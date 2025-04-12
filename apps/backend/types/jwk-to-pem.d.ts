declare module 'jwk-to-pem' {
  interface JWK {
    kty: string;
    n: string;
    e: string;
    [key: string]: any;
  }
  
  function jwkToPem(jwk: JWK): string;
  export = jwkToPem;
} 