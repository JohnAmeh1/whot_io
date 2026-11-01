from django.test import SimpleTestCase

from .engine import Game, GameError, build_deck


def new_game(n_bots):
    g = Game("ABCDE", "host-pid-0001")
    g.join_player("host-pid-0001", "Host")
    for _ in range(n_bots):
        g.add_bot("host-pid-0001")
    return g


class EngineTests(SimpleTestCase):
    def test_deck_has_54_cards(self):
        self.assertEqual(len(build_deck()), 54)

    def test_ten_players_max(self):
        g = new_game(9)
        with self.assertRaises(GameError):
            g.add_bot("host-pid-0001")
        with self.assertRaises(GameError):
            g.join_player("someone-new-01", "Late")

    def test_every_table_size_finishes(self):
        for n in range(1, 10):
            for _ in range(15):
                g = new_game(n)
                g.start_game("host-pid-0001")
                for _ in range(3000):
                    if g.status != "playing":
                        break
                    g.auto_move(g.players[g.turn])
                    total = sum(len(p.hand) for p in g.players) + len(g.draw) + len(g.discard)
                    self.assertEqual(total, 54)
                self.assertEqual(g.status, "finished")

    def test_pick_two_stacks_and_hidden_hands(self):
        g = new_game(1)
        g.start_game("host-pid-0001")
        view = g.view("host-pid-0001")
        self.assertNotIn("hand", g.view("nobody-at-all")["players"][0])
        self.assertEqual(len(view["players"]), 2)
        self.assertIsNone(g.view("nobody-at-all")["me"])
