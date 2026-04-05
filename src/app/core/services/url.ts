import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class UrlService {
  private baseUrl = 'https://urlshortner.karthi-dev.work';

  constructor(private http: HttpClient) {}

  createShortUrl(longUrl: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/url?longUrl=${longUrl}`, {});
  }
}
