# Ayan's Hall of Fame 🚀🏆

Welcome to my 3D Portfolio. This immersive web application showcases my diverse projects and achievements in a visually captivating way. Step into a world of innovation and creativity, where each element represents a milestone in my tech journey.

## Introduction

This 3D Portfolio is built using the powerful combination of Blender and Three.js, creating a seamless and interactive experience for visitors. As the hall extends to infinity, it symbolizes the limitless potential of technology and the endless possibilities for innovation.

## Features

- **Infinite Hall:** The hall extends infinitely, representing the abundance of projects and achievements in my tech journey.

- **Interactive Navigation:** Visitors can navigate through the 3D space, clicking and dragging to explore each project.

- **Unique Showcases:** Each element in the hall showcases a specific project, using captivating animations and visual effects.

## How to Use

1. Choose **Enter the hall** to walk with WASD or the onscreen direction pad. Drag to look around. The left and right arrow keys also turn the camera.

2. Inspect a frame to read its date and story or open its original source. At SPARK, choose **Visit award** to travel from the April 2023 project to its March 2024 first-prize award. **Back to SPARK** returns to the project.

3. Open **Exhibit index** to search by topic or year. **Visit in 3D** takes you directly to that exhibit. The index also works when WebGL is unavailable.

## Technologies Used

- Blender
- Three.js
- HTML5
- CSS3
- JavaScript

## Installation

As the 3D Portfolio is a web-based application, there is no installation required. Simply visit the live website [here](https://ayan-khan.com) and immerse yourself in the experience.

For a local preview, run `python -m http.server 8000` from this directory and open `http://localhost:8000`. The site serves its Three.js modules, Draco decoder, fonts and images locally.

## Adding an exhibit

Add the poster to `static/imgs/` and insert an entry in [achievements.js](./achievements.js) at the desired position in the hallway. Supply a unique `id`, a `title`, a display `date` such as `April 2023`, a short `summary`, a relative poster `image` path, and the original source `url`. The hall and index use the same collection.

To connect two milestones, set each entry’s `relatedId` to the other entry’s ID. An optional `relatedAction` names the jump button. Every frame displays its original poster. An optional `wallImage` can supply a smaller copy of that print for distant frames. Set `featured: true` to show an exhibit at the entrance, where `artwork` can supply its cover illustration.

## Feedback

Your feedback is valuable to me! If you have any suggestions, questions, or encounter any issues while exploring the 3D Portfolio, please don't hesitate to reach out to me.

Thank you for visiting my 3D Portfolio - Hall of Fame! I hope you enjoy the experience and get inspired by the innovations showcased in this captivating space. Let's continue to push the boundaries of technology and create a brighter future together! 🌟🚀
