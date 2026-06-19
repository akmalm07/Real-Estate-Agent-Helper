# CURRENT.md

## Project

AI SaaS CRM for real estate agents.

The platform ingests leads from sources such as Zillow and Realtor.com through email integrations, organizes them into a CRM, automates initial outreach, and helps agents prioritize leads using AI.

---

## Current Goal

Build the Gmail and Outlook email ingestion pipeline.

---

## Core Features

* Email parsing for lead detection
* Lead management dashboard
* Automated SMS and email outreach
* AI-powered lead ranking
* Agent takeover of conversations
* Conversation history and reporting

---

## Current Stack

Frontend:

* React
* TypeScript

Backend:

* Node.js
* Express

Database:

* TBD (PostgreSQL vs Firebase)

AI:

* OpenAI GPT-4o

---

## Planned Architecture

High-level MVP flow:

Lead Email
  ↓
Email Parser
  ↓
Lead Database
  ↓
AI Ranking
  ↓
CRM Dashboard

---

## Constraints

* Keep MVP simple
* Avoid overengineering
* Prefer minimal abstractions
* Optimize for maintainability

---

## Current Priorities

1. Gmail integration
2. Outlook integration
3. Lead extraction pipeline
4. CRM data model
5. AI lead scoring

---

## Open Questions

* PostgreSQL or Firebase?
* Should lead scoring be configurable?
* Should AI outputs be cached?
* Which CRM integration should come first?

---

## Notes

* Frontend and backend currently live in separate folders.
* Focus on shipping a functional MVP before adding advanced automation.
