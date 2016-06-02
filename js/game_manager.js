function GameManager(size, InputManager, Actuator, StorageManager) {
  this.size           = size; // Size of the grid
  this.inputManager   = new InputManager;
  this.storageManager = new StorageManager;
  this.actuator       = new Actuator;

  this.startTiles     = 2;

  this.inputManager.on("move", this.move.bind(this));
  this.inputManager.on("restart", this.restart.bind(this));
  this.inputManager.on("keepPlaying", this.keepPlaying.bind(this));

  this.setup();
}

// Restart the game
GameManager.prototype.restart = function () {
  this.storageManager.clearGameState();
  this.actuator.continueGame(); // Clear the game won/lost message
  this.setup();
};

// Keep playing after winning (allows going over 2048)
GameManager.prototype.keepPlaying = function () {
  this.keepPlaying = true;
  this.crush       = 100;
  this.cover       = 100;
  this.cut         = 100;
  this.disprove    = 100;
  this.decapitate  = 100;
  this.eat         = 100;
  this.poison      = 100;
  this.smash       = 100;
  this.vaporize    = 100;
  this.actuator.continueGame(); // Clear the game won/lost message
};

// Return true if the game is lost, or has won and the user hasn't kept playing
GameManager.prototype.isGameTerminated = function () {
  return this.over || (this.won && !this.keepPlaying);
};

// Set up the game
GameManager.prototype.setup = function () {
  var previousState = this.storageManager.getGameState();

  // Reload the game from a previous game if present
  if (previousState) {
    this.grid        = new Grid(previousState.grid.size,
                                previousState.grid.cells); // Reload grid
    this.score       = previousState.score;
    this.crush       = previousState.crush;
    this.cover       = previousState.cover;
    this.cut         = previousState.cut;
    this.disprove    = previousState.disprove;
    this.decapitate  = previousState.decapitate;
    this.eat         = previousState.eat;
    this.poison      = previousState.poison;
    this.smash       = previousState.smash;
    this.vaporize    = previousState.vaporize;
    this.over        = previousState.over;
    this.won         = previousState.won;
    this.keepPlaying = previousState.keepPlaying;
  } else {
    this.grid        = new Grid(this.size);
    this.score       = 0;
    this.crush       = 0;
    this.cover       = 0;
    this.cut         = 0;
    this.disprove    = 0;
    this.decapitate  = 0;
    this.eat         = 0;
    this.poison      = 0;
    this.smash       = 0;
    this.vaporize    = 0;
    this.over        = false;
    this.won         = false;
    this.keepPlaying = false;

    // Add the initial tiles
    this.addStartTiles();
  }

  // Update the actuator
  this.actuate();
};

// Set up the initial tiles to start the game with
GameManager.prototype.addStartTiles = function () {
  for (var i = 0; i < this.startTiles; i++) {
    this.addRandomTile();
  }
};

// Adds a tile in a random position
GameManager.prototype.addRandomTile = function () {
  if (this.grid.cellsAvailable()) {
    if(Math.random() < 0.2)
      var value = 2;
    else if(Math.random() < 0.4 && Math.random() > 0.2)
      var value = 4;
    else if(Math.random() < 0.6 && Math.random() > 0.4)
      var value = 8;
    else if(Math.random() > 0.8)
      var value = 32;
    else
      var value = 16;
    var tile = new Tile(this.grid.randomAvailableCell(), value);

    this.grid.insertTile(tile);
  }
};

// Sends the updated grid to the actuator
GameManager.prototype.actuate = function () {
  if (this.storageManager.getBestScore() < this.score) {
    this.storageManager.setBestScore(this.score);
  }

  // Clear the state when the game is over (game over only, not win)
  if (this.over) {
    this.storageManager.clearGameState();
  } else {
    this.storageManager.setGameState(this.serialize());
  }

  this.actuator.actuate(this.grid, {
    score:      this.score,
    crush:      this.crush,
    cover:      this.cover,
    cut:        this.cut,
    disprove:   this.disprove,
    decapitate: this.decapitate,
    eat:        this.eat,
    poison:     this.poison,
    smash:      this.smash,
    vaporize:   this.vaporize, 
    over:       this.over,
    won:        this.won,
    bestScore:  this.storageManager.getBestScore(),
    terminated: this.isGameTerminated()
  });

};

// Represent the current game as an object
GameManager.prototype.serialize = function () {
  return {
    grid:        this.grid.serialize(),
    score:       this.score,
    crush:       this.crush,
    cover:       this.cover,
    cut:         this.cut,
    disprove:    this.disprove,
    decapitate:  this.decapitate,
    eat:         this.eat,
    poison:      this.poison,
    smash:       this.smash,
    vaporize:    this.vaporize, 
    over:        this.over,
    won:         this.won,
    keepPlaying: this.keepPlaying
  };
};

// Save all tile positions and remove merger info
GameManager.prototype.prepareTiles = function () {
  this.grid.eachCell(function (x, y, tile) {
    if (tile) {
      tile.mergedFrom = null;
      tile.savePosition();
    }
  });
};

// Move a tile and its representation
GameManager.prototype.moveTile = function (tile, cell) {
  this.grid.cells[tile.x][tile.y] = null;
  this.grid.cells[cell.x][cell.y] = tile;
  tile.updatePosition(cell);
};

// Move tiles on the grid in the specified direction
GameManager.prototype.move = function (direction) {
  // 0: up, 1: right, 2: down, 3: left
  var self = this;

  if (this.isGameTerminated()) return; // Don't do anything if the game's over

  var cell, tile;

  var vector     = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved      = false;

  // Save the current tile positions and remove merger information
  this.prepareTiles();

  // Traverse the grid in the right direction and move tiles
  traversals.x.forEach(function (x) {
    traversals.y.forEach(function (y) {
      cell = { x: x, y: y };
      tile = self.grid.cellContent(cell);

      if (tile) {
        var positions = self.findFarthestPosition(cell, vector);
        var next      = self.grid.cellContent(positions.next);

        if(next && next.value == 8 && self.crush > 0 && tile.value == 2 && !next.mergedFrom) {        // rock crushes scizzor
          var merged = new Tile(positions.next, tile.value);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          tile.updatePosition(positions.next);
          self.crush--;
          if(Math.random() > 0.5)
            self.cut++;
          else
            self.decapitate++;
          self.score += 5;
        }
        else if(next && next.value == 16 && self.crush > 0 && tile.value == 2 && !next.mergedFrom) {    // rock crushes lizard
          var merged = new Tile(positions.next, tile.value);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          tile.updatePosition(positions.next);
          self.crush--;
          if(Math.random() > 0.5)
            self.eat++;
          else
            self.poison++;
          self.score += 5;
        }
        else if(next && next.value == 2 && self.cover > 0 && tile.value == 4 && !next.mergedFrom) {     // paper covers rock
          var merged = new Tile(positions.next, tile.value);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          tile.updatePosition(positions.next);
          self.cover--;
          self.crush++;
          self.score += 5;
        }
        else if(next && next.value == 32 && self.disprove > 0 && tile.value == 4 && !next.mergedFrom) {   // paper disproves spoc
          var merged = new Tile(positions.next, tile.value);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          tile.updatePosition(positions.next);
          self.disprove--;
          if(Math.random() > 0.5)
            self.smash++;
          else
            self.vaporize++;
          self.score += 5;
        }
        else if(next && next.value == 4 && self.cut > 0 && tile.value == 8 && !next.mergedFrom) {   // scizzor cuts paper
          var merged = new Tile(positions.next, tile.value);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          tile.updatePosition(positions.next);
          self.cut--;
          if(Math.random() > 0.5)
            self.cover++;
          else
            self.disprove++;
          self.score += 5;
        }
        else if(next && next.value == 16 && self.decapitate > 0 && tile.value == 8 && !next.mergedFrom) {   // scizzor decapitates lizard
          var merged = new Tile(positions.next, tile.value);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          tile.updatePosition(positions.next);
          self.decapitate--;
          if(Math.random() > 0.5)
            self.eat++;
          else
            self.poison++;
          self.score += 5;
        }
        else if(next && next.value == 4 && self.eat > 0 && tile.value == 16 && !next.mergedFrom) {    // lizard eats paper
          var merged = new Tile(positions.next, tile.value);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          tile.updatePosition(positions.next);
          self.eat--;
          if(Math.random() > 0.5)
            self.cover++;
          else
            self.disprove++;
          self.score += 5;
        }
        else if(next && next.value == 32 && self.poison > 0 && tile.value == 16 && !next.mergedFrom) {    // lizard poisons spoc
          var merged = new Tile(positions.next, tile.value);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          tile.updatePosition(positions.next);
          self.poison--;
          if(Math.random() > 0.5)
            self.smash++;
          else
            self.vaporize++;
          self.score += 5;
        }
        else if(next && next.value == 2 && self.vaporize > 0 && tile.value == 32 && !next.mergedFrom) {   // spoc vaporizes rock
          var merged = new Tile(positions.next, tile.value);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          tile.updatePosition(positions.next);
          self.vaporize--;
          self.crush++;
          self.score += 5;
        }
        else if(next && next.value == 8 && self.smash > 0 && tile.value == 32 && !next.mergedFrom) {   // spoc smashes scizzors
          var merged = new Tile(positions.next, tile.value);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          tile.updatePosition(positions.next);
          self.smash--;
          if(Math.random() > 0.5)
            self.cut++;
          else
            self.decapitate++;
          self.score += 5;
        }
        else {
          self.moveTile(tile, positions.farthest);
        }

        /*// Only one merger per row traversal?
        if (next && next.value === tile.value && !next.mergedFrom) {
          var merged = new Tile(positions.next, tile.value * 2);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          // Converge the two tiles' positions
          tile.updatePosition(positions.next);

          // Update the score
          self.score += merged.value;

          // The mighty 2048 tile
          if (merged.value === 2048) self.won = true;
        } else {
          self.moveTile(tile, positions.farthest);
        }*/

        if (!self.positionsEqual(cell, tile)) {
          moved = true; // The tile moved from its original cell!
        }
      }
    });
  });

  if (moved) {
    this.addRandomTile();

    if (!this.movesAvailable()) {
      this.over = true; // Game over!
    }

    this.actuate();
  }
};

// Get the vector representing the chosen direction
GameManager.prototype.getVector = function (direction) {
  // Vectors representing tile movement
  var map = {
    0: { x: 0,  y: -1 }, // Up
    1: { x: 1,  y: 0 },  // Right
    2: { x: 0,  y: 1 },  // Down
    3: { x: -1, y: 0 }   // Left
  };

  return map[direction];
};

// Build a list of positions to traverse in the right order
GameManager.prototype.buildTraversals = function (vector) {
  var traversals = { x: [], y: [] };

  for (var pos = 0; pos < this.size; pos++) {
    traversals.x.push(pos);
    traversals.y.push(pos);
  }

  // Always traverse from the farthest cell in the chosen direction
  if (vector.x === 1) traversals.x = traversals.x.reverse();
  if (vector.y === 1) traversals.y = traversals.y.reverse();

  return traversals;
};

GameManager.prototype.findFarthestPosition = function (cell, vector) {
  var previous;

  // Progress towards the vector direction until an obstacle is found
  do {
    previous = cell;
    cell     = { x: previous.x + vector.x, y: previous.y + vector.y };
  } while (this.grid.withinBounds(cell) &&
           this.grid.cellAvailable(cell));

  return {
    farthest: previous,
    next: cell // Used to check if a merge is required
  };
};

GameManager.prototype.movesAvailable = function () {
  return this.grid.cellsAvailable() || this.tileMatchesAvailable();
};

// Check for available matches between tiles (more expensive check)
GameManager.prototype.tileMatchesAvailable = function () {
  var self = this;

  var tile;

  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      tile = this.grid.cellContent({ x: x, y: y });

      if (tile) {
        for (var direction = 0; direction < 4; direction++) {
          var vector = self.getVector(direction);
          var cell   = { x: x + vector.x, y: y + vector.y };

          var other  = self.grid.cellContent(cell);

          if (other && other.value === tile.value) {
            return true; // These two tiles can be merged
          }
        }
      }
    }
  }

  return false;
};

GameManager.prototype.positionsEqual = function (first, second) {
  return first.x === second.x && first.y === second.y;
};
