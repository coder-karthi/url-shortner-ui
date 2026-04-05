import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UrlService } from '../../../../core/services/url';

@Component({
  selector: 'app-home',
  imports: [FormsModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
  standalone: true,
})
export class Home {
  longUrl = '';
  shortUrl = signal('');
  loading = signal(false);

  constructor(private urlService: UrlService) {}

  onLongUrlChange() {
    this.shortUrl.set('');
  }

  generate() {
    if (!this.longUrl) return;

    this.loading.set(true);

    this.urlService.createShortUrl(this.longUrl).subscribe({
      next: (res) => {
        this.shortUrl.set(res.shortUrl);
        this.loading.set(false);
      },
      error: () => {
        alert('Something went wrong');
        this.loading.set(false);
      },
    });
  }

  copy() {
    navigator.clipboard.writeText(this.shortUrl());
    alert('Copied!');
  }
}
