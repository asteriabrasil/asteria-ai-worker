export class AdoApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly body: string
  ) {
    super(message);
    this.name = "AdoApiError";
    Object.setPrototypeOf(this, AdoApiError.prototype);
  }
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
    Object.setPrototypeOf(this, ConfigError.prototype);
  }
}
