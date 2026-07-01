import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import guestsRouter from "./guests";
import preregistrationsRouter from "./preregistrations";
import watchlistRouter from "./watchlist";
import auditRouter from "./audit";
import usersRouter from "./users";
import dashboardRouter from "./dashboard";
import productionsRouter from "./productions";
import photosRouter from "./photos";
import studiosRouter from "./studios";
import alertsRouter from "./alerts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(guestsRouter);
router.use(preregistrationsRouter);
router.use(watchlistRouter);
router.use(auditRouter);
router.use(usersRouter);
router.use(dashboardRouter);
router.use(productionsRouter);
router.use(photosRouter);
router.use(studiosRouter);
router.use(alertsRouter);

export default router;
