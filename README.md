# X4 Vault Finder

This is a visualisation tool for X4 save files. It shows a 3D plot for every sector. Stations and vaults are visible, as well as their state.

It uses colors for highlighting:

* Red for khaak stations
* Purple for vaults with collectable wares
* Blue for vaults with collectable blueprints
* Orange for empty vaults


## How to run

1. Clone this repository
2. On your local machine open a shell in this directory
3. Find a savegame file and copy its path
    * Under Windows, check `Documents\Egosoft\X4\<YourSteamID>\save`
    * Under Linux it's usually `$HOME/.config/EgoSoft/X4/<user-id>/save/`
    * The filename should end with `.xml.gz`
4. Pipe your savefile into the python script
    * Windows: `TODO`
    * Linux: `python3 x4_vault_finder.py < $HOME/.config/EgoSoft/X4/<user-id>/save/<name>.xml.gz`
5. A browser window will open
6. Click a sector on the left to see its map. The plot is 3D and can be moved with the mouse. Points of interest are highlighted.


## Technical details

* The savefile is not modified
* You only need python and a browser, no external dependencies need to be installed
* The python script uses little memory by streaming the savefile in a single pass and keeping only relevant data
* Thanks to the [X4-Info-Miner](https://github.com/TuxInvader/X4-Info-Miner) project for the offsets needed to calculate object positions
