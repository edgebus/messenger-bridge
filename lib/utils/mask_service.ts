export abstract class MaskService {
  private static lazyInstance: MaskService | null = null;

  /**
   * A default instance of MaskService.
   */
  public static get default(): MaskService {
    if (this.lazyInstance == null) {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      this.lazyInstance = new MaskServiceImpl(7, 11);
    }
    return this.lazyInstance;
  }

  /**
   * Mask generic API Key to be safe to pass it into console, logger, etc.
   *
   * For example:
   * - 9b16e7a082fe04c21d3ae620c -> 9b*********************0c
   *
   * @param apiKey API Key to be masked
   * @returns Masked API Key
   */
  public abstract maskApiKey(apiKey: string): string;

  /**
   * Mask generic API Secret to be safe to pass it into console, logger, etc.
   *
   * For example:
   * - 9b16e7a082fe04c21d3ae620c -> 9b*********************0c
   *
   * @param apiSecret API Secret to be masked
   * @returns Masked API Secret
   */
  public abstract maskApiSecret(apiSecret: string): string;

  /**
   * Mask URI to be safe to pass it into console, logger, etc.
   *
   * For example:
   * - postgres://user:password@hostname:port/database -> postgres://user:p******d@hostname:port/database
   *
   * @param uri URI to be masked
   * @returns Masked URI
   */
  public abstract maskUri(uri: string): string;

  /**
   * Mask URI to be safe to pass it into console, logger, etc.
   *
   * For example:
   * - postgres://user:password@hostname:port/database -> postgres://user:p******d@hostname:port/database
   *
   * @param uri URI to be masked
   * @returns Masked URI
   */
  public abstract maskUri(uri: URL): URL;
}

export class MaskServiceImpl implements MaskService {
  private readonly lowLen: number;

  private readonly highLen: number;

  private readonly maskSymbol: string;

  /**
   * Initializes a new instance of the MaskService class.
   * @param lowLen Minimal chars to mask as one first and one last symbol
   * @param highLen Minimal chars to mask as two first and two last symbol
   * @param maskSymbol Mask symbol
   */
  public constructor(lowLen: number, highLen: number, maskSymbol = '*') {
    if (lowLen < 2) {
      throw new Error('lowLen: Low length may not be lesser 2.');
    }
    if (highLen < 4) {
      throw new Error('highLen: High length may not be lesser 4.');
    }
    if (lowLen > highLen) {
      throw new Error('highLen: High length should not be less than Low length.');
    }
    if (maskSymbol.length !== 1) {
      throw new Error('maskSymbol: Mask symbol should be of length 1');
    }
    this.lowLen = lowLen;
    this.highLen = highLen;
    this.maskSymbol = maskSymbol;
  }

  public maskApiSecret(apiKey: string): string {
    return this.maskSensitiveDataByAsterisk(apiKey);
  }

  public maskApiKey(apiSecret: string): string {
    return this.maskSensitiveDataByAsterisk(apiSecret);
  }

  public maskHttpHeaderValue(headerValue: string): string {
    return this.maskSensitiveDataByAsterisk(headerValue);
  }

  public maskUri(uri: string): string;

  public maskUri(uri: URL): URL;

  public maskUri(uri: string | URL): string | URL {
    const url: URL = !(uri instanceof URL) ? new URL(uri) : uri;

    const maskedUri: URL = new URL(url.toString());

    const escapedUser: string = url.username;
    if (escapedUser != null && escapedUser.length > 0) {
      const user = decodeURIComponent(escapedUser);
      const maskedUser = this.maskSensitiveDataByAsterisk(user);
      const escapedMaskedUser = encodeURIComponent(maskedUser);
      maskedUri.username = escapedMaskedUser;
    }

    maskedUri.password = "";  // No password

    if (typeof uri === "string") {
      return maskedUri.toString();
    }

    return maskedUri;
  }

  private maskSensitiveDataByAsterisk(data: string): string {
    const len: number = data.length;
    const maskSym: string = this.maskSymbol;

    if (len === this.lowLen) {
      return `${data[0]}${maskSym.repeat(len - 1)}`;
    }
    if (len > this.lowLen && len < this.highLen) {
      return `${data[0]}${maskSym.repeat(len - 2)}${data[data.length - 1]}`;
    }
    if (len === this.highLen) {
      return `${data.substring(0, 2)}${maskSym.repeat(len - 3)}${data[data.length - 1]}`;
    }
    if (len >= this.highLen) {
      return `${data.substring(0, 2)}${maskSym.repeat(len - 4)}${data.substring(data.length - 2)}`;
    }
    return maskSym.repeat(len);
  }
}
