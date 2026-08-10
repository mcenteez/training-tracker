export class AuthorizationError extends Error {
  constructor() {
    super("You do not have permission to perform this action");
    this.name = "AuthorizationError";
  }
}

export class ResourceNotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} was not found`);
    this.name = "ResourceNotFoundError";
  }
}

export class DomainInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainInvariantError";
  }
}
