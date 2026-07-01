import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import guestsRouter from "./guests";
import preregistrationsRouter from "./preregistrations";
import watchlistRouter from "./watchlist";
import auditRouter from "./audit";
import usersRouter from "./users";
import dashboardRouter from "./dashboard";
import photosRouter from "./photos";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(guestsRouter);
router.use(preregistrationsRouter);
router.use(watchlistRouter);
router.use(auditRouter);
router.use(usersRouter);
router.use(dashboardRouter);
router.use(photosRouter);

export default router;
