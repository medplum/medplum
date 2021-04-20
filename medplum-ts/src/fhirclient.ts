import { auth } from "./auth";
import { Bundle, SearchDefinition } from "./types";
// import { SearchDefinition } from "./model/Search";

// const API_BASE_URL = process.env['API_BASE_URL'] as string;
const API_BASE_URL = 'http://localhost:5000/fhir/R4/';
// const TOKEN = 'eyJraWQiOiI1MzQyMTBkYi01MTMxLTQ2NTctODEwZC1iMjVjNDdjOTU4NTgiLCJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJodHRwOi8vaG9zdC5kb2NrZXIuaW50ZXJuYWw6NTAwMC8iLCJleHAiOjE2MTg0NDQ5MTgsImp0aSI6IjE0MTZiMDlkLTQwOGMtNDE4My04YWRmLTVjZjE0YTNkNzBjYyIsImlhdCI6MTYxODQ0MTMxOCwibmJmIjoxNjE4NDQxMTk4LCJ1c2VybmFtZSI6ImIyNTcyY2VhLWJkZWEtNGE2Ni1hNDY1LTFmMzRiNGYyZTE1YyIsInNjb3BlIjoibGF1bmNoL3BhdGllbnQgb3BlbmlkIGZoaXJVc2VyIG9mZmxpbmVfYWNjZXNzIHVzZXIvKi4qIiwidG9rZW5fdXNlIjoiYWNjZXNzIiwic3ViIjoiYjI1NzJjZWEtYmRlYS00YTY2LWE0NjUtMWYzNGI0ZjJlMTVjIiwiY2xpZW50X2lkIjoiMGIzOGI0NGYtNDRiZi00ODAzLWI1MTQtMDUyNDllY2I3YTgxIiwicHJvZmlsZSI6IlBhdGllbnQvYjI1NzJjZWEtYmRlYS00YTY2LWE0NjUtMWYzNGI0ZjJlMTVjIn0.I8OIenLwMtMFfhu8_zfu0k7tM-xVpDXggvkR9ss4Q3GPbG0SAj5Xv_Vso3WqME6QYWGJIgah6A6AjfzsMz2a93rg7jKIwlfPW-O-7_TQzYuzOIFeBGu7rm8Qinw0Ji0bk4mpxtTvJwb97XPAvnLeyUmSKdX9IYgkRt5yURbboZVmRqw2CLllO3dov6uLcxnpWF5QdanQjhDiRZ8b_rG1ceBNDTLQ6ZTotj57Lcg1TZcNEJKgCjmbsMr-iiIRYCAx5tY69beK_w7j58H41JLrQ4_Xx0kCW-vejbP2z33JFXURZ8AOOYdGsM0VpD-niEF2vtLJPdHlhzro49NLxDSYRw';

export const FhirClient = {
  accessToken: '',

  /**
   * Makes an HTTP request.
   * @param {string} method
   * @param {string} url
   * @param {string=} contentType
   * @param {Object=} body
   * @param {boolean=} blob
   */
  fetch: (method: string, url: string, contentType?: string, body?: any, blob?: boolean) => {
    if (!url.startsWith('http')) {
      url = API_BASE_URL + url;
    }

    const options: any = {
      method: method,
      cache: 'no-cache',
      credentials: 'include',
      headers: {
        'Authorization': 'Bearer ' + auth.accessToken
        // 'Authorization': 'Bearer ' + FhirClient.accessToken
        // 'Authorization': 'Bearer ' + TOKEN
      }
    };

    if (contentType) {
      options.headers['Content-Type'] = contentType;
    }

    if (body) {
      if (typeof body === 'string' || body instanceof File) {
        options.body = body;
      } else {
        options.body = JSON.stringify(body, keyReplacer);
      }
    }

    return new Promise((resolve, reject) => {
      fetch(url, options)
        .then(response => {
          if (response.status === 401) {
            auth.refresh();
            reject(new Error('Unauthorized'));
          }
          return blob ? response.blob() : response.json();
        })
        .then(obj => {
          if (obj.issue && obj.issue.length > 0) {
            const error = new Error(obj.issue[0].details.text);
            // error.severity = 'error';
            // error.operationOutcome = obj;
            reject(error);
          }
          resolve(obj);
        })
        .catch(error => {
          reject(error);
        })
    });
  },

  search: (search: SearchDefinition): Promise<Bundle> => {
    const path = API_BASE_URL + (search.resourceType || 'Patient');
    const params = [];
    if (search.page) {
      params.push('_page=' + search.page);
    }
    if (search.pageSize) {
      params.push('_pageSize=' + search.page);
    }
    if (search.sort) {
      params.push('_sort=' + search.sort);
    }
    const filters = search.filters;
    if (filters) {
      for (let i = 0; i < filters.length; i++) {
        const filter = filters[i];
        params.push(filter.key + '=' + filter.value);
      }
    }
    const url = path + (params.length > 0 ? '?' + params.join('&') : '');
    return FhirClient.fetch('GET', url) as Promise<Bundle>;
  },

  user: () => {
    return FhirClient.fetch('GET', API_BASE_URL + 'fhiruser');
  },

  read: (resourceType: string, id: string) => {
    return FhirClient.fetch('GET', API_BASE_URL + resourceType + '/' + encodeURIComponent(id));
  },

  readHistory(resourceType: string, id: string) {
    return FhirClient.fetch('GET', API_BASE_URL + resourceType + '/' + encodeURIComponent(id) + '/_history');
  },

  readPatientEverything(id: string) {
    return FhirClient.fetch('GET', API_BASE_URL + 'Patient/' + encodeURIComponent(id) + '/$everything');
  },

  readBlob: (url: string) => {
    return FhirClient.fetch('GET', url, undefined, undefined, true);
  },

  readBinary: (resourceType: string, id: string) => {
    return FhirClient.readBlob(API_BASE_URL + resourceType + '/' + encodeURIComponent(id));
  },

  create(resourceType: string, resource: any, contentType?: string) {
    return FhirClient.fetch(
      'POST',
      API_BASE_URL + resourceType,
      contentType || 'application/fhir+json',
      resource);
  },

  update(resourceType: string, id: string, resource: any) {
    return FhirClient.fetch('PUT', API_BASE_URL + resourceType + '/' + encodeURIComponent(id), 'application/fhir+json', resource);
  },

  patch(resourceType: string, id: string, operations: any) {
    return FhirClient.fetch('PATCH', API_BASE_URL + resourceType + '/' + encodeURIComponent(id), 'application/json-patch+json', operations);
  },
};

/**
 * Replaces any key/value pair of key "__key" with value undefined.
 * This function can be used as the 2nd argument to JSON.stringify to remove __key properties.
 * We add __key properties to array elements to improve React render performance.
 * @param {string} k Property key.
 * @param {*} v Property value.
 */
export function keyReplacer(k: string, v: string) {
  return k === '__key' ? undefined : v;
}
