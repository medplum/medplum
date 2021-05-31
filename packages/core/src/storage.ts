
export class Storage {

  clear() {
    localStorage.clear();
  }

  getString(key: string): string | undefined {
    return localStorage.getItem(key) || undefined;
  }

  setString(key: string, value: string | undefined) {
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  }

  getObject<T>(key: string): T | undefined {
    const str = this.getString(key);
    return str ? JSON.parse(str) as T : undefined;
  }

  setObject<T>(key: string, value: T) {
    this.setString(key, value ? JSON.stringify(value) : undefined);
  }
}