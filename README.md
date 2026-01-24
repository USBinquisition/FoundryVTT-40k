# Dark Heresy 2E - Continued

An **UNOFFICIAL** system for playing Dark Heresy 2E on [Foundry VTT](https://foundryvtt.com/).

Originally created by Necaladun, this fork updates the system for Foundry V13's jQuery changes and continues Dark Heresy 2E automation work.

It provides support for **character sheets only**, game content should be drawn from official source books.

The project is being continued under the GPL-3.0 License after the original author deleted their project.

## Install
1. Go to the setup page and choose **Game Systems**.
2. Click the **Install System** button, and paste in this [manifest link](https://github.com/FoundryVTT-40k/FoundryVTT-40k/releases/download/0.6a/system.json).
3. Create a Game World using the Dark Heresy system.

## Preview
![Acolyte 1](asset/preview/acolyte1.jpg)
![Acolyte 2](asset/preview/acolyte2.jpg)

## Related Website
- https://foundryvtt.com/
- https://www.drivethrurpg.com/browse/pub/54/Cubicle-7-Entertainment-Ltd/subcategory/179_21610/Dark-Heresy-Second-Edition

## Licence
[GNU General Public License v3.0](https://choosealicense.com/licenses/gpl-3.0/)

## Release Builder (Python + GUI)

A CRT-themed Python release builder now drives release packaging and manifest updates.

- GUI: `npm run release`
- CLI (no zip): `python scripts/release_builder.py --version 0.6a --release-type release --changelog strict --skip-npm-ci --skip-build`
- Local packaging (not committed): `python scripts/release_builder.py --version 0.6a --stage-tree --make-zip`
- Git + GitHub release upload (requires `gh`): `python scripts/release_builder.py --version 0.6a --git-tag --git-push --push-tag --github-release --stage-tree --make-zip`

Release metadata is written into `releases/<tag>/` with a `release.json` file and a copy of `system.json`. Zip artifacts are only produced locally under `build/release/` when `--make-zip` is enabled.
