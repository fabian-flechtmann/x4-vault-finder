# X4 Vault Finder

This is a visualisation tool for X4 save files. It shows a 3D plot for every sector. Stations and vaults are visible, as well as their state.

It uses colors for highlighting:

* Blue for vaults with collectable blueprints
* Purple for vaults with collectable wares
* Pink for vaults with signal leaks
* Brown for empty vaults
* Red for khaak stations
* Yellow for abandoned ships
* Green for player stations

<img width="939" height="817" alt="Screenshot_20251015_095808" src="https://github.com/user-attachments/assets/13c8fa99-07ff-4cf4-bf7d-f5790c7acf0c" />

## How to run

1. Clone this repository
2. On your local machine open a shell in this directory
3. Pipe your savefile into the python script
    * Windows
        * `python x4-vault-finder.py < "%USERPROFILE%\Documents\Egosoft\X4\<user-id>\save\<name>.xml.gz"`
    * Linux:
        * `python3 x4-vault-finder.py < "$HOME/.config/EgoSoft/X4/<user-id>/save/<name>.xml.gz"`
4. A browser window will open
5. Click a sector on the left to see its map. The plot is 3D and can be moved with the mouse. Points of interest are highlighted.


## Technical details

* The savefile is not modified
* You only need python and a browser, no external dependencies need to be installed
* The python script uses little memory by streaming the savefile in a single pass and keeping only relevant data
* Thanks to the [X4-Info-Miner](https://github.com/TuxInvader/X4-Info-Miner) project for developing the x4-cat-miner.py script
