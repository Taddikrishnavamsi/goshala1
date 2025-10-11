import http from 'k6/http';
import { sleep } from 'k6';

export let options = {
  stages: [
    { duration: '1m', target: 100 },   // Ramp up to 100 users in 1 minute
    { duration: '5m', target: 100 },   // Hold at 100 users for 5 minutes
    { duration: '1m', target: 0 }      // Ramp down in 1 minute
  ],
};

export default function () {
  let response = http.get('https://goshala1.vercel.app');
  sleep(1);  // 1 second sleep between requests
}
