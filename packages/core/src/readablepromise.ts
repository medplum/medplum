/**
 * The ReadablePromise class wraps a request promise suitable for React Suspense.
 * See: https://blog.logrocket.com/react-suspense-data-fetching/#wrappromise-js
 * See: https://github.com/ovieokeh/suspense-data-fetching/blob/master/lib/api/wrapPromise.js
 */
export class ReadablePromise<T> implements Promise<T> {
  readonly [Symbol.toStringTag]: string = 'ReadablePromise';
  private suspender: Promise<T>;
  private status: 'pending' | 'error' | 'success' = 'pending';
  private response: T | undefined;
  private error: Error | undefined;

  constructor(requestPromise: Promise<T>) {
    this.suspender = requestPromise.then(
      (res: T) => {
        this.status = 'success';
        this.response = res;
        return res;
      },
      (err: any) => {
        this.status = 'error';
        this.error = err;
        throw err;
      }
    );
  }

  /**
   * Returns true if the promise is pending.
   * @returns True if the Promise is pending.
   */
  isPending(): boolean {
    return this.status === 'pending';
  }

  /**
   * Returns true if the promise resolved successfully.
   * @returns True if the Promise resolved successfully.
   */
  isOk(): boolean {
    return this.status === 'success';
  }

  /**
   * Attempts to read the value of the promise.
   * If the promise is pending, this method will throw a promise.
   * If the promise rejected, this method will throw the rejection reason.
   * If the promise resolved, this method will return the resolved value.
   * @returns The resolved value of the Promise.
   */
  read(): T {
    switch (this.status) {
      case 'pending':
        throw this.suspender;
      case 'error':
        throw this.error;
      default:
        return this.response as T;
    }
  }

  /**
   * Attaches callbacks for the resolution and/or rejection of the Promise.
   * @param onfulfilled - The callback to execute when the Promise is resolved.
   * @param onrejected - The callback to execute when the Promise is rejected.
   * @returns A Promise for the completion of which ever callback is executed.
   */
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.suspender.then(onfulfilled, onrejected);
  }

  /**
   * Attaches a callback for only the rejection of the Promise.
   * @param onrejected - The callback to execute when the Promise is rejected.
   * @returns A Promise for the completion of the callback.
   */
  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null
  ): Promise<T | TResult> {
    return this.suspender.catch(onrejected);
  }

  /**
   * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
   * resolved value cannot be modified from the callback.
   * @param onfinally - The callback to execute when the Promise is settled (fulfilled or rejected).
   * @returns A Promise for the completion of the callback.
   */
  finally(onfinally?: (() => void) | undefined | null): Promise<T> {
    return this.suspender.finally(onfinally);
  }
}
