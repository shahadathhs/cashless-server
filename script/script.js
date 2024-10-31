import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter } from "k6/metrics";

const BASE_URL = "https://cashless-server.vercel.app";
const headers = { "Content-Type": "application/json" };
const errorCounter = new Counter("errors");

export const options = {
  stages: [
    { duration: "10s", target: 10 },
    { duration: "20s", target: 10 },
    { duration: "10s", target: 0 },
  ],
};

export default function () {
  let token = null;

  group("User Registration", () => {
    const payload = JSON.stringify({
      name: "Test User",
      pin: "12345",
      phone: "0123456789",
      email: "testuser@example.com",
      role: "user",
    });

    const res = http.post(`${BASE_URL}/register`, payload, { headers });
    check(res, {
      "User registration successful": (r) => r.status === 200,
      "User registration failed": (r) => r.status !== 200,
    }) || errorCounter.add(1);
  });

  sleep(1);

  group("User Login", () => {
    const payload = JSON.stringify({
      identifier: "testuser@example.com",
      pin: "12345",
    });

    const res = http.post(`${BASE_URL}/login`, payload, { headers });
    const loginSuccess = check(res, {
      "User login successful": (r) => r.status === 200,
      "User login failed": (r) => r.status !== 200,
    });

    if (loginSuccess) {
      token = res.json("token");
    } else {
      errorCounter.add(1);
    }
  });

  if (token) {
    sleep(1);

    group("Check Balance", () => {
      const res = http.get(`${BASE_URL}/balance/${new mongodb.ObjectId().toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      check(res, {
        "Balance retrieved successfully": (r) => r.status === 200,
        "Failed to retrieve balance": (r) => r.status !== 200,
      }) || errorCounter.add(1);
    });

    sleep(1);

    group("Cash-in Request", () => {
      const payload = JSON.stringify({
        agentPhone: "0987654321",
        amount: 100,
      });

      const res = http.post(`${BASE_URL}/cashin`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      check(res, {
        "Cash-in request successful": (r) => r.status === 200,
        "Cash-in request failed": (r) => r.status !== 200,
      }) || errorCounter.add(1);
    });

    sleep(1);

    group("Cash-out Request", () => {
      const payload = JSON.stringify({
        agentPhone: "0987654321",
        amount: 50,
      });

      const res = http.post(`${BASE_URL}/cashout`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      check(res, {
        "Cash-out request successful": (r) => r.status === 200,
        "Cash-out request failed": (r) => r.status !== 200,
      }) || errorCounter.add(1);
    });

    sleep(1);
  } else {
    console.error("Token is undefined. Login may have failed.");
  }
}
