// Error compartido por el cliente HTTP real.
export class ApiError extends Error {
  constructor(message, { status = 0, network = false, rateLimit = false, session = false } = {}) {
    super(message);
    this.status = status;
    this.network = network;
    this.rateLimit = rateLimit;
    this.session = session;
  }
}