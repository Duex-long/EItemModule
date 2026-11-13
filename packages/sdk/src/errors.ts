export class GatewayError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'GatewayError';
  }
}

export class ConfigurationError extends GatewayError {
  constructor(message: string) {
    super('configuration', message);
    this.name = 'ConfigurationError';
  }
}
