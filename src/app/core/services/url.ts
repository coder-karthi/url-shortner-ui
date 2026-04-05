import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type UrlSortField = 'createdAt' | 'clickCount' | 'shortCode' | 'longUrl';
export type UrlSortDirection = 'asc' | 'desc';

export interface UrlMappingListQuery {
  page: number;
  pageSize: number;
  search: string;
  sortBy: UrlSortField;
  sortDirection: UrlSortDirection;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface UrlMappingListItem {
  id: string;
  longUrl: string;
  shortCode: string;
  createdAt: string;
  clickCount: number;
}

export interface CreateShortUrlResponse {
  shortUrl: string;
}

@Injectable()
export class UrlService {
  private readonly http = inject(HttpClient);
  readonly baseUrl = 'https://urlshortner.karthi-dev.work';

  createShortUrl(longUrl: string): Observable<CreateShortUrlResponse> {
    const params = new HttpParams().set('longUrl', longUrl);
    return this.http.post<CreateShortUrlResponse>(`${this.baseUrl}/api/url`, {}, { params });
  }

  getUrlMappings(query: UrlMappingListQuery): Observable<PagedResult<UrlMappingListItem>> {
    let params = new HttpParams()
      .set('page', query.page)
      .set('pageSize', query.pageSize)
      .set('sortBy', query.sortBy)
      .set('sortDirection', query.sortDirection);

    if (query.search) {
      params = params.set('search', query.search);
    }

    return this.http.get<PagedResult<UrlMappingListItem>>(`${this.baseUrl}/api/url`, { params });
  }

  buildShortUrl(shortCode: string) {
    return `${this.baseUrl}/${shortCode}`;
  }
}
