export interface ReadablePromise<T> extends Promise<T> {
  isPending(): boolean;
  read(): T;
}

export class MedplumResolvedPromise<T> implements ReadablePromise<T> {
  readonly [Symbol.toStringTag]: string = 'MedplumResolvedPromise';
  #value: T;

  constructor(value: T) {
    this.#value = value;
  }

  isPending(): boolean {
    return false;
  }

  read(): T {
    return this.#value;
  }

  /**
   * Attaches callbacks for the resolution and/or rejection of the Promise.
   * @param onfulfilled The callback to execute when the Promise is resolved.
   * @param _onrejected The callback to execute when the Promise is rejected.
   * @returns A Promise for the completion of which ever callback is executed.
   */
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    _onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    if (onfulfilled) {
      onfulfilled(this.#value);
    }
    return this as unknown as Promise<TResult1>;
  }

  /**
   * Attaches a callback for only the rejection of the Promise.
   * @param onrejected The callback to execute when the Promise is rejected.
   * @returns A Promise for the completion of the callback.
   */
  catch<TResult = never>(
    _onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null
  ): Promise<T | TResult> {
    return this as Promise<T | TResult>;
  }

  /**
   * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
   * resolved value cannot be modified from the callback.
   * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
   * @returns A Promise for the completion of the callback.
   */
  finally(onfinally?: (() => void) | undefined | null): Promise<T> {
    if (onfinally) {
      onfinally();
    }
    return this;
  }
}

export class MedplumRejectedPromise<T> implements ReadablePromise<T> {
  readonly [Symbol.toStringTag]: string = 'MedplumRejectedPromise';
  #reason: any;

  constructor(reason: any) {
    this.#reason = reason;
  }

  isPending(): boolean {
    return false;
  }

  read(): T {
    throw this.#reason;
  }

  /**
   * Attaches callbacks for the resolution and/or rejection of the Promise.
   * @param onfulfilled The callback to execute when the Promise is resolved.
   * @param _onrejected The callback to execute when the Promise is rejected.
   * @returns A Promise for the completion of which ever callback is executed.
   */
  then<TResult1 = T, TResult2 = never>(
    _onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    if (onrejected) {
      onrejected(this.#reason);
    }
    return this as unknown as Promise<TResult1>;
  }

  /**
   * Attaches a callback for only the rejection of the Promise.
   * @param onrejected The callback to execute when the Promise is rejected.
   * @returns A Promise for the completion of the callback.
   */
  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null
  ): Promise<T | TResult> {
    if (onrejected) {
      onrejected(this.#reason);
    }
    return this as Promise<T | TResult>;
  }

  /**
   * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
   * resolved value cannot be modified from the callback.
   * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
   * @returns A Promise for the completion of the callback.
   */
  finally(onfinally?: (() => void) | undefined | null): Promise<T> {
    if (onfinally) {
      onfinally();
    }
    return this;
  }
}

/**
 * The MedplumQueryPromise class wraps a request promise for React Suspense.
 * See: https://blog.logrocket.com/react-suspense-data-fetching/#wrappromise-js
 * See: https://github.com/ovieokeh/suspense-data-fetching/blob/master/lib/api/wrapPromise.js
 */
export class MedplumQueryPromise<T> implements ReadablePromise<T> {
  readonly [Symbol.toStringTag]: string = 'MedplumQueryPromise';
  #suspender: Promise<T>;
  #status: 'pending' | 'error' | 'success' = 'pending';
  #response: T | undefined;
  #error: any;

  constructor(requestPromise: Promise<T>) {
    this.#suspender = requestPromise.then(
      (res: T) => {
        this.#status = 'success';
        this.#response = res;
        return res;
      },
      (err: any) => {
        this.#status = 'error';
        this.#error = err;
        throw err;
      }
    );
  }

  isPending(): boolean {
    return this.#status === 'pending';
  }

  read(): T {
    switch (this.#status) {
      case 'pending':
        throw this.#suspender;
      case 'error':
        throw this.#error;
      default:
        return this.#response as T;
    }
  }

  /**
   * Attaches callbacks for the resolution and/or rejection of the Promise.
   * @param onfulfilled The callback to execute when the Promise is resolved.
   * @param onrejected The callback to execute when the Promise is rejected.
   * @returns A Promise for the completion of which ever callback is executed.
   */
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.#suspender.then(onfulfilled, onrejected);
  }

  /**
   * Attaches a callback for only the rejection of the Promise.
   * @param onrejected The callback to execute when the Promise is rejected.
   * @returns A Promise for the completion of the callback.
   */
  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null
  ): Promise<T | TResult> {
    return this.#suspender.catch(onrejected);
  }

  /**
   * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
   * resolved value cannot be modified from the callback.
   * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
   * @returns A Promise for the completion of the callback.
   */
  finally(onfinally?: (() => void) | undefined | null): Promise<T> {
    return this.#suspender.finally(onfinally);
  }
}
