# Real Estate Lead Management Platform

## Overview

This project is a full-stack real estate lead management platform designed to help agents organize, communicate with, and follow up with prospective clients across multiple communication channels.

The system integrates with email providers, SMS messaging services, and lead-generation platforms to automatically capture incoming leads, create conversations, track communication history, and assist agents with AI-generated responses and workflow automation.

This project was built primarily as a software engineering and systems design exercise to explore large-scale backend architecture, API integrations, asynchronous event processing, AI-assisted workflows, and full-stack application development.

---

## Purpose

Real estate agents often receive leads from multiple sources such as:

* Zillow
* Realtor.com
* Referrals
* Direct email inquiries
* SMS conversations

Managing these leads manually can be time-consuming and error-prone.

The goal of this platform is to centralize lead management by:

* Automatically importing leads
* Tracking conversations
* Organizing communication history
* Assisting with follow-up messaging
* Providing a unified interface for managing client interactions

---

## Features

### Lead Management

* Create and manage leads
* Track lead status throughout the sales process
* Assign leads to properties
* Store notes and follow-up tasks
* Maintain activity history

### Multi-Channel Communication

* SMS messaging support
* Email conversation support
* Unified conversation tracking
* Conversation status management
* Follow-up scheduling

### AI-Assisted Workflows

* AI-generated SMS responses
* AI-generated email responses
* Lead information extraction from inbound emails
* Conversation context tracking
* Automated note generation
* Automated task suggestions
* Readiness-to-book detection

### Email Integration

* Gmail integration
* OAuth authentication
* Gmail Watch API integration
* Pub/Sub webhook processing
* Automated inbound email handling
* Email thread tracking

### Data Management

* PostgreSQL database
* Drizzle ORM
* Relational data modeling
* Audit and activity logging
* Lead-task management

### Frontend

* React-based user interface
* Lead dashboard
* Conversation views
* Messaging interface
* Lead detail pages
* Administrative workflows

---

## Technical Stack

### Frontend

* React
* Vite
* JavaScript
* React Router

### Backend

* Node.js
* Express
* Drizzle ORM

### Database

* PostgreSQL
* Neon

### Cloud Services

* Google Cloud Pub/Sub
* Gmail API

### AI

* OpenAI API

### Messaging

* Telnyx SMS

---

## System Architecture

High-level workflow:

1. Lead enters the system through email, referral, SMS, or external platform.
2. Lead data is parsed and stored.
3. Conversations are created or linked.
4. Communication history is preserved.
5. AI can generate suggested responses.
6. Messages are delivered through email or SMS providers.
7. Agent actions, notes, and tasks are tracked for future follow-up.

---

## Engineering Challenges

This project explores several non-trivial engineering problems:

* Email thread reconstruction
* OAuth account management
* Webhook processing
* Event-driven architecture
* Lead extraction from unstructured text
* AI-assisted workflow automation
* Multi-channel communication management
* Conversation state persistence
* Relational data modeling

---

## Current Limitations

This project remains under active development and is not considered production-ready.

Known areas that still require improvement include:

* Lead extraction accuracy for certain email formats
* Email threading edge cases
* Outlook-specific integrations
* Message delivery reliability improvements
* Additional testing and validation
* Error handling hardening
* Frontend polish and UX improvements
* Performance optimization for larger datasets

These limitations are expected and reflect the project's role as a learning and engineering-focused application rather than a commercial product.

---

## What I Learned

Through this project I gained hands-on experience with:

* Full-stack web application development
* Database design
* REST API development
* OAuth authentication flows
* Event-driven systems
* Cloud integrations
* AI-assisted software workflows
* Production-style debugging
* Large-scale application architecture

The project served as a practical environment for exploring how complex software systems are designed, integrated, debugged, and maintained across multiple services and communication channels.

---

## Disclaimer

This project was developed as a portfolio and learning project. While many features are functional, the system is not intended for production deployment without additional testing, security review, and operational hardening.
