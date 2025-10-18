# X4 Vault Finder

This is a visualisation toolchain for X4 save files. It shows a 3D plot for every sector in the browser.

It uses colors for different objects:

* Blue for vaults with collectable blueprints
* Purple for vaults with collectable wares
* Pink for vaults with signal leaks
* Brown for empty vaults
* Red for khaak stations
* Yellow for abandoned ships
* Green for player stations
* Silver for other stations
* A silver ring for gates

<img width="939" height="817" alt="Screenshot_20251015_095808" src="https://github.com/user-attachments/assets/13c8fa99-07ff-4cf4-bf7d-f5790c7acf0c" />

## How to run

1. Clone this repository or download it as a zip file and extract it locally
2. On your local machine open a shell in this directory
3. Pipe your savefile into the x4-vault-finder.py script
    * Windows (use cmd.exe, not powershell):
        * `python x4-vault-finder.py < "%USERPROFILE%\Documents\Egosoft\X4\<user-id>\save\<name>.xml.gz"`
    * Linux:
        * `python3 x4-vault-finder.py < "$HOME/.config/EgoSoft/X4/<user-id>/save/<name>.xml.gz"`
4. When the script finishes, a browser window will open
5. Click a sector on the left to show its 3D plot


## Technical details

* The savefile is not modified
* You only need python and a browser, no external dependencies need to be installed
* The python script uses little memory by streaming the savefile in a single pass and keeping only relevant data
* When a new DLC is released, the x4-data-extractor.py script needs to be run again
* Thanks to the [X4-Info-Miner](https://github.com/TuxInvader/X4-Info-Miner) project for developing the x4-cat-miner.py script
