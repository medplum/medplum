

export function parseDateString(str: string): Date {
  // try {
  //   // console.log('parseDateString', str);
  //   const result = new Date(str);
  //   // console.log('parseDateString result', result.toISOString());
  //   return result;
  // } catch (err) {
  //   // console.log('error parsing Date', err);
  //   return new Date();
  // }
  return new Date(str);
}
